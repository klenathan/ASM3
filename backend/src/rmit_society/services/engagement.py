from __future__ import annotations

from rmit_society.base import new_id, utc_now
from rmit_society.domain.engagement import Block, Follow, Notification, Report, ReportCreate, Vote
from rmit_society.errors import ConflictError, NotFoundError
from rmit_society.providers.queues import SQSQueuePublisher
from rmit_society.repositories.dynamodb import DynamoDBRepository


class EngagementService:
    def __init__(
        self, repo: DynamoDBRepository, publisher: SQSQueuePublisher | None = None
    ) -> None:
        self.repo = repo
        self.publisher = publisher or SQSQueuePublisher()

    def vote(self, *, content_id: str, user_id: str) -> None:
        if self.repo.get_post(content_id) is None and self.repo.get_comment(content_id) is None:
            raise NotFoundError("Content not found")
        vote = Vote(
            content_id=content_id,
            user_id=user_id,
            value=1,
            created_at=utc_now(),
            institution_id="rmit",
        )
        if self.repo.put_vote(vote):
            self.repo.increment_counter(content_id, "vote_count", 1)

    def unvote(self, *, content_id: str, user_id: str) -> None:
        self.repo.delete_vote(content_id, user_id)
        self.repo.increment_counter(content_id, "vote_count", -1)

    def follow(self, *, target_user_id: str, follower_user_id: str) -> None:
        if follower_user_id == target_user_id:
            raise ConflictError("You cannot follow yourself")
        if self.repo.get_user(target_user_id) is None:
            raise NotFoundError("User not found")
        follow = Follow(
            follower_user_id=follower_user_id,
            target_user_id=target_user_id,
            created_at=utc_now(),
            institution_id="rmit",
        )
        if self.repo.put_follow(follow):
            self._notify(target_user_id, "FOLLOW", actor_user_id=follower_user_id)

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
                institution_id="rmit",
            )
        )

    def unblock(self, *, target_user_id: str, blocker_user_id: str) -> None:
        self.repo.delete_block(blocker_user_id, target_user_id)

    def report(self, *, reporter_user_id: str, payload: ReportCreate) -> Report:
        content = self.repo.get_post(payload.content_id) or self.repo.get_comment(
            payload.content_id
        )
        if content is None:
            raise NotFoundError("Content not found")
        report = Report(
            report_id=new_id("rep"),
            content_id=payload.content_id,
            reporter_user_id=reporter_user_id,
            reason=payload.reason,
            note=payload.note,
            created_at=utc_now(),
            updated_at=utc_now(),
            institution_id="rmit",
        )
        if not self.repo.create_report(report):
            raise ConflictError("You already have an open report for this content")
        return report

    def _notify(
        self,
        recipient: str,
        notification_type: str,
        *,
        actor_user_id: str,
        content_id: str | None = None,
    ) -> None:
        notification = Notification(
            notification_id=new_id("n"),
            recipient_user_id=recipient,
            type=notification_type,
            content_id=content_id,
            actor_user_id=actor_user_id,
            created_at=utc_now(),
            institution_id="rmit",
        )
        self.repo.create_notification(notification)

    def notify_reply(self, *, recipient: str, actor_user_id: str, content_id: str) -> None:
        self._notify(recipient, "REPLY", actor_user_id=actor_user_id, content_id=content_id)

    def notify_moderation(self, *, recipient: str, content_id: str) -> None:
        self._notify(recipient, "MODERATION", actor_user_id="system", content_id=content_id)

    def notify_appeal(self, *, recipient: str, content_id: str) -> None:
        self._notify(recipient, "APPEAL", actor_user_id="system", content_id=content_id)

    def list_notifications(self, user_id: str) -> list[Notification]:
        return self.repo.list_notifications(user_id)

    def mark_read(self, *, notification_id: str, user_id: str) -> None:
        self.repo.mark_notification_read(notification_id, user_id)
