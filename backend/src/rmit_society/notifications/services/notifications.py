from __future__ import annotations

from rmit_society.base import new_id, utc_now
from rmit_society.notifications.models import Notification
from rmit_society.notifications.repositories.interface import NotificationRepository


class NotificationService:
    def __init__(self, repo: NotificationRepository) -> None:
        self.repo = repo

    def create(
        self,
        *,
        recipient_user_id: str,
        notification_type: str,
        actor_user_id: str | None = None,
        content_id: str | None = None,
    ) -> Notification:
        item = Notification(
            notification_id=new_id("n"),
            recipient_user_id=recipient_user_id,
            type=notification_type,
            actor_user_id=actor_user_id,
            content_id=content_id,
            created_at=utc_now(),
        )
        self.repo.create_notification(item)
        return item

    def list(
        self, user_id: str, *, limit: int = 50, cursor: str | None = None
    ) -> list[Notification]:
        del cursor
        return self.repo.list_notifications(user_id)[: max(1, min(limit, 100))]

    def mark_read(self, *, notification_id: str, user_id: str) -> None:
        self.repo.mark_notification_read(notification_id, user_id)
