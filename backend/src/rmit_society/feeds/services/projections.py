"""Idempotent feed projection event handling."""

from __future__ import annotations

from typing import Any


def project_event(event: dict[str, Any]) -> None:
    # Projection persistence is injected by the worker composition root.
    # Unknown or duplicate events are safe no-ops until a repository is bound.
    del event
