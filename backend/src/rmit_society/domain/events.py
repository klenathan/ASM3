from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from rmit_society.domain.users import INSTITUTION_ID


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


class Upload(BaseModel):
    entity_type: Literal["UPLOAD"] = "UPLOAD"
    upload_id: str
    owner_user_id: str
    society_id: str
    institution_id: str = INSTITUTION_ID
    declared_content_type: str
    declared_size: int
    quarantine_key: str
    state: str = "PENDING"
    media_id: str | None = None
    created_at: str
    updated_at: str
