"""Combined Lambda entry points dispatching to bounded-context workers."""

from __future__ import annotations

import json
from typing import Any

from rmit_society.analytics import workers as analytics_workers
from rmit_society.media import workers as media_workers
from rmit_society.moderation import workers as moderation_workers


def _bodies(event: dict[str, Any]) -> list[Any]:
    records = event.get("Records") or []
    parsed: list[Any] = []
    for record in records:
        body = record.get("body", "")
        try:
            parsed.append(json.loads(body))
        except (TypeError, ValueError):
            parsed.append(body)
    return parsed


def moderation_handler(event: dict[str, Any], context: Any) -> None:
    del context
    for message in _bodies(event):
        moderation_workers.moderate_content(message)


def image_handler(event: dict[str, Any], context: Any) -> None:
    del context
    for message in _bodies(event):
        media_workers.process_upload(message)


def event_handler(event: dict[str, Any], context: Any) -> None:
    del context
    for message in _bodies(event):
        analytics_workers.process_event(message)
