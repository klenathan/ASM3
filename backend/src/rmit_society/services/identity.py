from __future__ import annotations

from rmit_society.auth.claims import Role, UserStatus
from rmit_society.base import new_id, utc_now
from rmit_society.domain.users import User, UserProfileUpdate
from rmit_society.errors import ConflictError, NotFoundError
from rmit_society.repositories.dynamodb import DynamoDBRepository


def bootstrap_user(
    repo: DynamoDBRepository,
    *,
    cognito_sub: str,
    handle: str,
    display_name: str,
    role: Role = Role.STUDENT,
    institution_id: str = "rmit",
) -> User:
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
        role=role,
        status=UserStatus.ACTIVE,
        institution_id=institution_id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.put_user(user)
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
    user = get_current_user(repo, user_id)
    changes: dict[str, object] = {"updated_at": utc_now()}
    if update.display_name is not None:
        changes["display_name"] = update.display_name
    if update.bio is not None:
        changes["bio"] = update.bio
    if update.handle is not None and update.handle.lower() != user.handle.lower():
        if repo.get_user_by_handle(update.handle) is not None:
            raise ConflictError("Handle is already taken")
        if not repo.reserve_handle(update.handle, user_id):
            raise ConflictError("Handle is already taken")
        changes["handle"] = update.handle
        changes["gsi_handle_pk"] = f"HANDLE#{update.handle.lower()}"
    repo.update_user(user_id, **changes)
    updated = get_current_user(repo, user_id)
    return updated


def deactivate(repo: DynamoDBRepository, user_id: str) -> None:
    repo.update_user(user_id, status=UserStatus.DEACTIVATED.value, updated_at=utc_now())
