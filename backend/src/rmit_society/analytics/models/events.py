from __future__ import annotations

from pydantic import BaseModel, Field


class SanitizedAnalyticsEvent(BaseModel):
    event: str = Field(min_length=1, max_length=120)
    action: str = Field(default="", max_length=120)
    content_type: str | None = Field(default=None, max_length=32)
    occurred_at: str
