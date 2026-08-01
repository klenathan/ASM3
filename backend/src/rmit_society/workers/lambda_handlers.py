from __future__ import annotations

import json
from typing import Any

from rmit_society.workers import events, image, moderation


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
        moderation.moderate_content(message)


def image_handler(event: dict[str, Any], context: Any) -> None:
    del context
    for message in _bodies(event):
        image.process_upload(message)


def event_handler(event: dict[str, Any], context: Any) -> None:
    del context
    for message in _bodies(event):
        events.process_event(message)
