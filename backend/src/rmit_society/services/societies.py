from __future__ import annotations

from rmit_society.base import new_id, utc_now
from rmit_society.domain.societies import Society, SocietyCreate, SocietyMembership, SocietyUpdate
from rmit_society.errors import AuthorizationError, ConflictError, NotFoundError
from rmit_society.repositories.dynamodb import DynamoDBRepository


def create_society(
    repo: DynamoDBRepository, *, actor_user_id: str, payload: SocietyCreate
) -> Society:
    if not repo.reserve_slug(payload.slug, "pending"):
        raise ConflictError("Society slug is already taken")
    society_id = new_id("s")
    while repo.get_society(society_id) is not None:
        society_id = new_id("s")
    society = Society(
        society_id=society_id,
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        rules=payload.rules,
        owner_user_id=actor_user_id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.create_society(society)
    membership = SocietyMembership(
        society_id=society_id, user_id=actor_user_id, is_moderator=True, joined_at=utc_now()
    )
    repo.join(membership)
    repo.increment_members(society_id, 1)
    return society


def get_society(repo: DynamoDBRepository, slug: str) -> Society:
    society = repo.get_society_by_slug(slug)
    if society is None:
        raise NotFoundError("Society not found")
    return society


def list_societies(repo: DynamoDBRepository) -> list[Society]:
    return repo.list_societies()


def update_society(
    repo: DynamoDBRepository, *, society: Society, actor_user_id: str, payload: SocietyUpdate
) -> Society:
    if actor_user_id != society.owner_user_id and not repo.is_moderator(
        society.society_id, actor_user_id
    ):
        raise AuthorizationError("Only moderators may update this society")
    changes: dict[str, object] = {"updated_at": utc_now()}
    if payload.name is not None:
        changes["name"] = payload.name
    if payload.description is not None:
        changes["description"] = payload.description
    if payload.rules is not None:
        changes["rules"] = payload.rules
    repo.update_society(society.society_id, **changes)
    updated = repo.get_society(society.society_id)
    if updated is None:
        raise NotFoundError("Society not found")
    return updated


def join_society(repo: DynamoDBRepository, *, society_id: str, user_id: str) -> None:
    membership = SocietyMembership(
        society_id=society_id, user_id=user_id, is_moderator=False, joined_at=utc_now()
    )
    if repo.join(membership):
        repo.increment_members(society_id, 1)


def leave_society(repo: DynamoDBRepository, *, society_id: str, user_id: str) -> None:
    if repo.is_member(society_id, user_id):
        repo.leave(society_id, user_id)
        repo.increment_members(society_id, -1)


def list_members(repo: DynamoDBRepository, society_id: str) -> list[SocietyMembership]:
    return repo.list_members(society_id)


def set_moderator(
    repo: DynamoDBRepository,
    *,
    society_id: str,
    actor_user_id: str,
    target_user_id: str,
    is_moderator: bool,
) -> None:
    society = repo.get_society(society_id)
    if society is None:
        raise NotFoundError("Society not found")
    if actor_user_id != society.owner_user_id and not repo.is_moderator(society_id, actor_user_id):
        raise AuthorizationError("Moderator role required")
    if not repo.is_member(society_id, target_user_id):
        raise NotFoundError("Target is not a member")
    if not repo.set_moderator(society_id, target_user_id, is_moderator):
        raise NotFoundError("Target not found")
