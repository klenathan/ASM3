"""Engagement use cases with idempotent repository operations."""

from __future__ import annotations

from rmit_society.base import utc_now
from rmit_society.engagement.models import Block, Follow, Vote
from rmit_society.engagement.repositories.interface import EngagementRepository
from rmit_society.errors import ConflictError, NotFoundError


class EngagementService:
    def __init__(self, repo: EngagementRepository) -> None:
        self.repo = repo

    def vote(self, *, content_id: str, user_id: str) -> None:
        if self.repo.get_post(content_id) is None and self.repo.get_comment(content_id) is None:
            raise NotFoundError("Content not found")
        if self.repo.put_vote(Vote(content_id=content_id, user_id=user_id, created_at=utc_now())):
            self.repo.increment_counter(content_id, "vote_count", 1)

    def unvote(self, *, content_id: str, user_id: str) -> None:
        deleted = self.repo.delete_vote(content_id, user_id)
        if deleted:
            self.repo.increment_counter(content_id, "vote_count", -1)

    def follow(self, *, target_user_id: str, follower_user_id: str) -> None:
        if follower_user_id == target_user_id:
            raise ConflictError("You cannot follow yourself")
        if self.repo.get_user(target_user_id) is None:
            raise NotFoundError("User not found")
        self.repo.put_follow(
            Follow(
                follower_user_id=follower_user_id,
                target_user_id=target_user_id,
                created_at=utc_now(),
            )
        )

    def unfollow(self, *, target_user_id: str, follower_user_id: str) -> None:
        self.repo.delete_follow(follower_user_id, target_user_id)

    def block(self, *, target_user_id: str, blocker_user_id: str) -> None:
        if blocker_user_id == target_user_id:
            raise ConflictError("You cannot block yourself")
        self.repo.put_block(
            Block(
                blocker_user_id=blocker_user_id,
                target_user_id=target_user_id,
                created_at=utc_now(),
            )
        )

    def unblock(self, *, target_user_id: str, blocker_user_id: str) -> None:
        self.repo.delete_block(blocker_user_id, target_user_id)
