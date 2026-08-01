from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request

from rmit_society.auth.claims import Claims, Role
from rmit_society.auth.jwt import claims_from_token
from rmit_society.errors import AuthenticationError, AuthorizationError
from rmit_society.repositories.dynamodb import DynamoDBRepository


@lru_cache
def _repository() -> DynamoDBRepository:
    return DynamoDBRepository()


class AuthenticatedUser:
    """Resolved identity for the current request."""

    def __init__(self, claims: Claims, user_id: str) -> None:
        self.claims = claims
        self.user_id = user_id

    @property
    def institution_id(self) -> str:
        return self.claims.institution_id

    @property
    def role(self) -> Role:
        return self.claims.role

    @property
    def is_active(self) -> bool:
        return self.claims.is_active


def _bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("Missing bearer token")
    return token.strip()


def resolve_claims(request: Request) -> Claims:
    return claims_from_token(_bearer_token(request))


def resolve_current_user(request: Request) -> AuthenticatedUser:
    claims = resolve_claims(request)
    user = _repository().get_user_by_cognito_sub(claims.subject)
    if user is None:
        raise AuthenticationError("User profile has not been bootstrapped")
    return AuthenticatedUser(claims=claims, user_id=user.user_id)


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
    user: Annotated[AuthenticatedUser, Depends(resolve_current_user)],
) -> AuthenticatedUser:
    if user.role not in (Role.RMIT_ADMIN, Role.PLATFORM_ADMIN):
        raise AuthorizationError("Administrator role required")
    return user


def require_moderator(request: Request) -> AuthenticatedUser:
    user = resolve_current_user(request)
    if not user.claims.is_moderator:
        raise AuthorizationError("Moderator role required")
    return user


CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ModeratorUser = Annotated[AuthenticatedUser, Depends(require_moderator)]
