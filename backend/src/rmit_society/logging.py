from __future__ import annotations

import logging
import sys
from collections.abc import Mapping
from typing import Any

from rmit_society.config import get_settings

_STRUCTURED_KEYS = {"message", "time", "level", "correlation_id", "service", "logger"}


class _RedactingFilter(logging.Filter):
    """Redact known sensitive fields from log records."""

    SENSITIVE = (
        "email",
        "body",
        "text",
        "content",
        "token",
        "jwt",
        "presigned",
        "password",
        "secret",
        "media",
        "comment",
        "bio",
        "avatar",
    )

    def filter(self, record: logging.LogRecord) -> bool:
        message = getattr(record, "msg", None)
        if isinstance(message, dict):
            record.msg = self._redact(message)
        elif isinstance(message, str):
            record.msg = self._redact_string(message)
        return True

    def _redact(self, data: Mapping[str, Any]) -> dict[str, Any]:
        redacted: dict[str, Any] = {}
        for key, value in data.items():
            if any(tag in key.lower() for tag in self.SENSITIVE) and key not in _STRUCTURED_KEYS:
                redacted[key] = "<redacted>"
            elif isinstance(value, Mapping):
                redacted[key] = self._redact(value)
            else:
                redacted[key] = value
        return redacted

    def _redact_string(self, message: str) -> str:
        return message


def configure_logging() -> None:
    settings = get_settings()
    handlers: list[logging.Handler]
    if settings.environment == "test":
        handlers = []
    else:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        handlers = [console]

    root = logging.getLogger("rmit_society")
    root.handlers = handlers
    root.propagate = False
    root.setLevel(logging.INFO if settings.environment != "test" else logging.CRITICAL)
    root.addFilter(_RedactingFilter())


def get_logger(name: str, *, correlation_id: str | None = None) -> logging.Logger:
    del correlation_id
    return logging.getLogger(f"rmit_society.{name}")
