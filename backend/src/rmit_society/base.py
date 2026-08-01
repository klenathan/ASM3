from __future__ import annotations

import base64
import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime
from typing import cast


def utc_now() -> str:
    """Returns an opaque-microsecond UTC ISO 8601 timestamp with +00:00 offset."""
    return datetime.now(UTC).isoformat(timespec="microseconds")


def new_id(prefix: str = "") -> str:
    token = uuid.uuid4().hex
    return f"{prefix}_{token}" if prefix else token


def new_upload_id() -> str:
    return f"up_{secrets.token_urlsafe(18)}"


def tx_id() -> str:
    return uuid.uuid4().hex


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def encode_cursor(payload: dict[str, object], *, version: int = 1) -> str:
    """Encodes a tamper-resistant, versioned cursor."""
    body = {**payload, "_v": version}
    raw = json.dumps(body, separators=(",", ":")).encode()
    digest = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())[:6].decode()
    opaque = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return f"{opaque}.{digest}"


def decode_cursor(cursor: str, *, version: int = 1) -> dict[str, object]:
    """Decodes and verifies a cursor produced by :func:`encode_cursor`."""
    opaque, _, digest = cursor.rpartition(".")
    if not opaque or not digest:
        raise ValueError("Malformed cursor")
    try:
        raw = base64.urlsafe_b64decode(opaque + "=" * (-len(opaque) % 4))
    except Exception as error:
        raise ValueError("Malformed cursor") from error
    if base64.urlsafe_b64encode(hashlib.sha256(raw).digest())[:6].decode() != digest:
        raise ValueError("Invalid cursor signature")
    payload = cast(dict[str, object], json.loads(raw.decode()))
    if payload.get("_v") != version:
        raise ValueError("Unsupported cursor version")
    payload.pop("_v", None)
    return payload
