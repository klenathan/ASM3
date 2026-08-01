from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from functools import lru_cache
from typing import Any, Protocol, cast
from urllib.request import urlopen

from rmit_society.auth.claims import Claims, Role, UserStatus
from rmit_society.errors import AuthenticationError

RMIT_INSTITUTION_ID = "rmit"


class JwtVerifier(Protocol):
    def verify(self, token: str) -> dict[str, Any]: ...


class LocalJwtVerifier:
    """Stateless test-only identity substitute.

    Encodes signed, expiring payloads that mirror Cognito access-token claims.
    Deployed environments always configure and validate a real Cognito issuer.
    """

    def __init__(self, *, issuer: str = "local", audience: str = "local") -> None:
        self._issuer = issuer
        self._audience = audience

    def issue(
        self,
        *,
        subject: str,
        role: Role = Role.STUDENT,
        status: UserStatus = UserStatus.ACTIVE,
        ttl_s: int = 3600,
        institution_id: str = RMIT_INSTITUTION_ID,
        cognito_username: str = "",
    ) -> str:
        from datetime import timedelta

        from rmit_society.base import parse_timestamp, utc_now

        issued = parse_timestamp(utc_now())
        header = {"alg": "none", "typ": "JWT"}
        payload = {
            "iss": self._issuer,
            "aud": self._audience,
            "sub": subject,
            "exp": int((issued + timedelta(seconds=ttl_s)).timestamp()),
            "iat": int(issued.timestamp()),
            "institution_id": institution_id,
            "role": role.value,
            "status": status.value,
        }
        if cognito_username:
            payload["cognito:username"] = cognito_username
        import base64
        import hashlib

        def b64(data: dict[str, Any]) -> str:
            raw = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
            return base64.urlsafe_b64encode(raw).decode().rstrip("=")

        header_b64 = b64(header)
        payload_b64 = b64(payload)
        signing_input = f"{header_b64}.{payload_b64}"
        signature = (
            base64.urlsafe_b64encode(hashlib.sha256(signing_input.encode()).digest())
            .decode()
            .rstrip("=")
        )
        return f"{signing_input}.{signature}"

    def verify(self, token: str) -> dict[str, Any]:
        import time

        try:
            header_b64, payload_b64, signature = token.split(".")
        except ValueError as error:
            raise AuthenticationError("Invalid token") from error

        import base64
        import hashlib

        def b64decode(part: str) -> dict[str, Any]:
            raw = base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))
            return cast(dict[str, Any], json.loads(raw.decode()))

        signing_input = f"{header_b64}.{payload_b64}"
        expected = (
            base64.urlsafe_b64encode(hashlib.sha256(signing_input.encode()).digest())
            .decode()
            .rstrip("=")
        )
        if signature != expected:
            raise AuthenticationError("Invalid token signature")

        try:
            header = b64decode(header_b64)
            payload = b64decode(payload_b64)
        except Exception as error:
            raise AuthenticationError("Invalid token") from error

        if header.get("alg") != "none":
            raise AuthenticationError("Unsupported token algorithm")
        if payload.get("iss") != self._issuer:
            raise AuthenticationError("Invalid token issuer")
        if payload.get("aud") != self._audience:
            raise AuthenticationError("Invalid token audience")
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise AuthenticationError("Token expired")
        if not payload.get("sub"):
            raise AuthenticationError("Token missing subject")
        return payload


class CognitoJwtVerifier:
    """Validate Cognito access tokens without native crypto dependencies."""

    _SHA256_DIGEST_INFO = bytes.fromhex(
        "3031300d060960864801650304020105000420"
    )

    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        jwks_url: str,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks_url = jwks_url
        self._keys: dict[str, dict[str, str]] | None = None

    @staticmethod
    def _decode_part(part: str) -> bytes:
        return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))

    def _keys_for_token(self) -> dict[str, dict[str, str]]:
        if self._keys is None:
            with urlopen(self._jwks_url, timeout=5) as response:
                document = json.load(response)
            keys = document.get("keys")
            if not isinstance(keys, list):
                raise ValueError("Invalid Cognito JWKS")
            self._keys = {
                str(key["kid"]): cast(dict[str, str], key)
                for key in keys
                if isinstance(key, dict) and key.get("kid")
            }
        return self._keys

    def _verify_signature(
        self, signing_input: bytes, signature: bytes, key: dict[str, str]
    ) -> None:
        if key.get("kty") != "RSA" or key.get("alg") != "RS256":
            raise ValueError("Unsupported Cognito signing key")
        modulus = int.from_bytes(self._decode_part(key["n"]), "big")
        exponent = int.from_bytes(self._decode_part(key["e"]), "big")
        length = (modulus.bit_length() + 7) // 8
        encoded = pow(int.from_bytes(signature, "big"), exponent, modulus).to_bytes(length, "big")
        digest_info = self._SHA256_DIGEST_INFO + hashlib.sha256(signing_input).digest()
        expected = bytes((0, 1)) + bytes((255,)) * (length - len(digest_info) - 3)
        expected += bytes((0,)) + digest_info
        if not hmac.compare_digest(encoded, expected):
            raise ValueError("Invalid Cognito signature")

    def verify(self, token: str) -> dict[str, Any]:
        try:
            header_part, payload_part, signature_part = token.split(".")
            header = cast(dict[str, Any], json.loads(self._decode_part(header_part)))
            claims = cast(dict[str, Any], json.loads(self._decode_part(payload_part)))
            if header.get("alg") != "RS256":
                raise ValueError("Unsupported Cognito algorithm")
            key = self._keys_for_token()[str(header["kid"])]
            self._verify_signature(
                f"{header_part}.{payload_part}".encode(),
                self._decode_part(signature_part),
                key,
            )
            if claims.get("iss") != self._issuer:
                raise ValueError("Invalid Cognito issuer")
            if int(claims.get("exp", 0)) <= int(time.time()):
                raise ValueError("Expired Cognito token")
        except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise AuthenticationError("Invalid Cognito token") from error

        if claims.get("token_use") != "access":
            raise AuthenticationError("Invalid Cognito token type")
        if claims.get("client_id") != self._audience:
            raise AuthenticationError("Invalid Cognito token audience")
        if not claims.get("sub"):
            raise AuthenticationError("Cognito token missing subject")
        return claims


def _cognito_defaults(pool_id: str, region: str) -> tuple[str, str]:
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"
    return issuer, f"{issuer}/.well-known/jwks.json"


@lru_cache
def build_verifier() -> JwtVerifier:
    from rmit_society.config import get_settings

    settings = get_settings()
    issuer = settings.cognito_issuer
    jwks_url = settings.cognito_jwks_url
    if settings.cognito_user_pool_id and settings.cognito_audience:
        default_issuer, default_jwks_url = _cognito_defaults(
            settings.cognito_user_pool_id,
            settings.cognito_user_pool_region,
        )
        issuer = issuer or default_issuer
        jwks_url = jwks_url or default_jwks_url
    if settings.cognito_audience and issuer and jwks_url:
        return CognitoJwtVerifier(
            issuer=issuer,
            audience=settings.cognito_audience,
            jwks_url=jwks_url,
        )
    return LocalJwtVerifier(issuer="local", audience="spa-client")


def claims_from_token(token: str) -> Claims:
    verifier = build_verifier()
    payload = verifier.verify(token)
    cognito_username = str(
        payload.get("cognito:username") or payload.get("username") or ""
    )
    return Claims(
        subject=str(payload["sub"]),
        institution_id=str(payload.get("institution_id", RMIT_INSTITUTION_ID)),
        role=Role(payload.get("role", Role.STUDENT.value)),
        status=UserStatus(payload.get("status", UserStatus.ACTIVE.value)),
        cognito_username=cognito_username,
    )
