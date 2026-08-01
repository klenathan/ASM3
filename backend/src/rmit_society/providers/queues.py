from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.base import new_id, utc_now
from rmit_society.config import get_settings
from rmit_society.domain.events import EventEnvelope
from rmit_society.errors import ProviderError


class SQSQueuePublisher:
    """Publishes versioned domain events to SQS."""

    def __init__(self) -> None:
        self._client: Any = client("sqs")

    def publish(
        self, event_type: str, version: int, payload: dict[str, Any], *, queue_url: str = ""
    ) -> None:
        url = queue_url or self._queue_for(event_type)
        if not url:
            return
        envelope = EventEnvelope(
            type=event_type,
            version=version,
            id=new_id("evt"),
            payload=payload,
            occurred_at=utc_now(),
        )
        try:
            self._client.send_message(
                QueueUrl=url,
                MessageBody=envelope.model_dump_json(),
                MessageGroupId="forum",
            )
        except Exception as error:
            raise ProviderError(f"Failed to enqueue {event_type}: {error}") from error

    @staticmethod
    def _queue_for(event_type: str) -> str:
        settings = get_settings()
        if event_type.startswith("ContentSubmitted"):
            return settings.moderation_queue_url
        if "Image" in event_type and "Approved" not in event_type:
            return settings.image_queue_url
        return settings.event_queue_url
