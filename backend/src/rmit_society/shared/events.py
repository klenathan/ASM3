"""Shared kernel: cross-cutting event and audit record types.

These records carry the small, structured payloads that are exchanged between
contexts (audit trails, feed projections, async event envelopes, idempotency).
Media-scoped records such as :class:`~rmit_society.media.domain.Upload` live
in their owning context instead.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class AuditEvent(BaseModel):
    entity_type: Literal["AUDIT_EVENT"] = "AUDIT_EVENT"
    event_id: str
    target_type: str
    target_id: str
    actor_user_id: str | None = None
    action: str
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    created_at: str
    institution_id: str = INSTITUTION_ID


class FeedEntry(BaseModel):
    entity_type: Literal["FEED_ENTRY"] = "FEED_ENTRY"
    feed_type: str
    feed_id: str
    content_id: str
    published_at: str
    institution_id: str = INSTITUTION_ID
    ttl: int | None = None


class EventEnvelope(BaseModel):
    type: str
    version: int
    id: str
    payload: dict[str, Any]
    occurred_at: str


class IdempotencyRecord(BaseModel):
    entity_type: Literal["IDEMPOTENCY"] = "IDEMPOTENCY"
    idempotency_key: str
    response: dict[str, Any]
    created_at: str
    ttl: int | None = None
