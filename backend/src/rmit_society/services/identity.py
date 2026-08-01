from __future__ import annotations

from rmit_society.auth.claims import Claims, Role, UserStatus
from rmit_society.base import new_id, utc_now
from rmit_society.domain.registration import (
    derive_username_from_email,
    validate_display_name,
    validate_study_area,
)
from rmit_society.domain.users import User, UserProfileUpdate
from rmit_society.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError_,
)
from rmit_society.repositories.dynamodb import DynamoDBRepository


def create_user_profile(
    repo: DynamoDBRepository,
    *,
    cognito_sub: str,
    handle: str,
    display_name: str,
    major: str,
    institution_id: str = "rmit",
) -> User:
    """Create (or return an existing) user profile, idempotent by Cognito sub.

    The handle is derived from a validated RMIT student email and never taken
    from client input. Retries after a Cognito success / profile-creation
    interruption converge to a single profile.
    """
    existing_by_sub = repo.get_user_by_cognito_sub(cognito_sub)
    if existing_by_sub is not None:
        return existing_by_sub

    existing = repo.get_user_by_handle(handle)
    if existing is not None and existing.cognito_sub != cognito_sub:
        raise ConflictError("Handle is already taken")
    if existing is not None and existing.cognito_sub == cognito_sub:
        repo.link_cognito_sub(cognito_sub, existing.user_id)
        return existing

    user_id = new_id("u")
    while repo.get_user(user_id) is not None:
        user_id = new_id("u")
    if not repo.reserve_handle(handle, user_id):
        raise ConflictError("Handle is already taken")
    user = User(
        user_id=user_id,
        cognito_sub=cognito_sub,
        handle=handle,
        display_name=display_name,
        major=major,
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
        institution_id=institution_id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.put_user(user)
    return user


def resolve_profile(repo: DynamoDBRepository, claims: Claims) -> User:
    """Return the authenticated user's existing profile, rejecting unknowns.

    Bootstrap is read-only: profiles are created during registration, so a
    Cognito account without a profile cannot be granted a synthesised identity.
    """
    if claims.cognito_username:
        try:
            expected_handle = derive_username_from_email(claims.cognito_username)
        except ValidationError_ as error:
            raise AuthenticationError("Unverified or ineligible RMIT identity") from error
    else:
        expected_handle = None

    user = repo.get_user_by_cognito_sub(claims.subject)
    if user is None:
        raise AuthenticationError("No profile for this account; register to continue")
    if expected_handle is not None and user.handle.lower() != expected_handle:
        raise AuthenticationError("Profile identity does not match your RMIT student email")
    return user


def get_current_user(repo: DynamoDBRepository, user_id: str) -> User:
    user = repo.get_user(user_id)
    if user is None:
        raise NotFoundError("User not found")
    return user


def get_user_by_handle(repo: DynamoDBRepository, handle: str) -> User:
    user = repo.get_user_by_handle(handle)
    if user is None or user.status in (UserStatus.DEACTIVATED, UserStatus.SUSPENDED):
        raise NotFoundError("User not found")
    return user


def update_profile(repo: DynamoDBRepository, user_id: str, update: UserProfileUpdate) -> User:
    get_current_user(repo, user_id)
    changes: dict[str, object] = {"updated_at": utc_now()}
    if update.display_name is not None:
        changes["display_name"] = validate_display_name(update.display_name)
    if update.bio is not None:
        changes["bio"] = update.bio
    if update.major is not None:
        changes["major"] = validate_study_area(update.major)
    repo.update_user(user_id, **changes)
    return get_current_user(repo, user_id)


def deactivate(repo: DynamoDBRepository, user_id: str) -> None:
    repo.update_user(user_id, status=UserStatus.DEACTIVATED.value, updated_at=utc_now())
