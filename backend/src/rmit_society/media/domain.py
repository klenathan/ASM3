"""Media bounded context: domain record for media uploads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID

__all__ = ["Upload"]


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
