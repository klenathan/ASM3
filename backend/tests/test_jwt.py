from rmit_society.auth.claims import Role, UserStatus
from rmit_society.auth.jwt import LocalJwtVerifier, claims_from_token
from rmit_society.errors import AuthenticationError


def _verifier() -> LocalJwtVerifier:
    return LocalJwtVerifier(issuer="local", audience="spa-client")


def test_valid_token_yields_claims() -> None:
    verifier = _verifier()
    token = verifier.issue(subject="u1", role=Role.MODERATOR)
    claims = claims_from_token(token)
    assert claims.subject == "u1"
    assert claims.role is Role.MODERATOR
    assert claims.is_active


def test_wrong_issuer_rejected() -> None:
    token = _verifier().issue(subject="u1")
    other = LocalJwtVerifier(issuer="other", audience="spa-client")
    try:
        other.verify(token)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass
    # ensure original verifier still accepts
    _verifier().verify(token)


def test_wrong_audience_rejected() -> None:
    token = _verifier().issue(subject="u1")
    other = LocalJwtVerifier(issuer="local", audience="other-client")
    try:
        other.verify(token)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass


def test_expired_token_rejected() -> None:
    verifier = _verifier()
    token = verifier.issue(subject="u1", ttl_s=-10)
    try:
        verifier.verify(token)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass


def test_tampered_signature_rejected() -> None:
    verifier = _verifier()
    token = verifier.issue(subject="u1")
    parts = token.split(".")
    tampered = f"{parts[0]}.{parts[1]}AAAA"
    try:
        verifier.verify(tampered)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass


def test_suspended_status_reflected() -> None:
    verifier = _verifier()
    token = verifier.issue(subject="u1", status=UserStatus.SUSPENDED)
    claims = claims_from_token(token)
    assert not claims.is_active
