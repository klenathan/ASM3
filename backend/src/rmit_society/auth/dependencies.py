from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from rmit_society.auth.claims import Claims, Role
from rmit_society.auth.jwt import claims_from_token
from rmit_society.errors import AuthenticationError, AuthorizationError
from rmit_society.identity.application import resolve_profile
from rmit_society.identity.domain import User
from rmit_society.repositories.factory import get_repository
from rmit_society.repositories.interfaces import Repository


@lru_cache
def _repository() -> Repository:
    return get_repository()


_bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="bearerAuth",
    description="Cognito access token",
)
_bearer_security = Security(_bearer_scheme)


class AuthenticatedUser:
    """Resolved identity for the current request.

    This object is request-scoped and is populated by authentication
    middleware. Authorization dependencies consume it from request state.
    """

    def __init__(self, claims: Claims, user_id: str) -> None:
        self.claims = claims
        self.user_id = user_id

    @classmethod
    def from_profile(cls, claims: Claims, profile: User) -> AuthenticatedUser:
        # Authorization attributes are authoritative in the profile, not in
        # caller-controlled custom JWT claims.
        effective_claims = Claims(
            subject=claims.subject,
            institution_id=profile.institution_id,
            role=profile.role,
            status=profile.status,
            cognito_username=claims.cognito_username,
        )
        return cls(effective_claims, profile.user_id)

    @property
    def institution_id(self) -> str:
        return self.claims.institution_id

    @property
    def role(self) -> Role:
        return self.claims.role

    @property
    def is_active(self) -> bool:
        return self.claims.is_active


def _bearer_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = None,
) -> str:
    if credentials is not None:
        return credentials.credentials

    # Keep request parsing as a fallback for direct calls and compatibility
    # with integrations that invoke this resolver outside FastAPI.
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("Missing bearer token")
    return token.strip()


def resolve_authenticated_user(claims: Claims, repo: Repository) -> AuthenticatedUser:
    profile = resolve_profile(repo, claims)
    return AuthenticatedUser.from_profile(claims, profile)


def resolve_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = _bearer_security,
) -> Claims:
    context = getattr(request.state, "authenticated_user", None)
    if isinstance(context, AuthenticatedUser):
        return context.claims
    return claims_from_token(_bearer_token(request, credentials))


def resolve_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = _bearer_security,
) -> AuthenticatedUser:
    context = getattr(request.state, "authenticated_user", None)
    if isinstance(context, AuthenticatedUser):
        return context
    claims = claims_from_token(_bearer_token(request, credentials))
    return resolve_authenticated_user(claims, _repository())


def require_active_user(
    user: Annotated[AuthenticatedUser, Depends(resolve_current_user)],
) -> AuthenticatedUser:
    if not user.is_active:
        raise AuthenticationError("Account is not active")
    return user


def require_rmit(
    user: Annotated[AuthenticatedUser, Depends(resolve_current_user)],
) -> AuthenticatedUser:
    if user.institution_id != "rmit":
        raise AuthorizationError("Not a member of this institution")
    return user


def require_admin(
    user: Annotated[AuthenticatedUser, Depends(require_active_user)],
) -> AuthenticatedUser:
    if user.role not in (Role.RMIT_ADMIN, Role.PLATFORM_ADMIN):
        raise AuthorizationError("Administrator role required")
    return user


def require_moderator(
    user: Annotated[AuthenticatedUser, Depends(require_active_user)],
) -> AuthenticatedUser:
    if not user.claims.is_moderator:
        raise AuthorizationError("Moderator role required")
    return user


CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ModeratorUser = Annotated[AuthenticatedUser, Depends(require_moderator)]
