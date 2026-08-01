"""Analytics bounded context: async event pipeline worker."""

from __future__ import annotations

from typing import Any

from rmit_society.analytics.providers import AnalyticsProvider
from rmit_society.analytics.services.exports import sanitize_event
from rmit_society.base import utc_now
from rmit_society.config import get_settings
from rmit_society.notifications.services.notifications import NotificationService
from rmit_society.repositories.factory import get_repository
from rmit_society.repositories.interfaces import Repository

__all__ = ["process_event"]


def process_event(event: dict[str, Any]) -> None:
    payload = event.get("payload", event)
    event_type = payload.get("type", event.get("type", ""))
    data = payload.get("payload", payload)

    repo = get_repository()
    if event_type.endswith("ContentModerated.v1"):
        _handle_moderated(repo, data)
    _export_analytics(event_type, data)


def _handle_moderated(repo: Repository, data: dict[str, Any]) -> None:
    content_id = str(data.get("content_id", ""))
    content = repo.get_post(content_id) or repo.get_comment(content_id)
    if content is None:
        return
    author = getattr(content, "author_user_id", "")
    if not author:
        return
    NotificationService(repo).create(
        recipient_user_id=author, notification_type="MODERATION", content_id=content_id
    )


def _export_analytics(event_type: str, data: dict[str, Any]) -> None:
    """Write a sanitized analytics record (no user content)."""
    settings = get_settings()
    if not settings.analytics_bucket:
        return
    record = sanitize_event(event_type, data, utc_now())
    date = record.occurred_at[:10]
    AnalyticsProvider().write_analytics_partition(date, [record.model_dump()])
