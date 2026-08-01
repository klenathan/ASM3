from __future__ import annotations

from typing import Any

from rmit_society.feeds.services.projections import project_event


def handle(event: dict[str, Any]) -> None:
    project_event(event)
