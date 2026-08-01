from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.domain.enums import ReportState
from rmit_society.domain.users import INSTITUTION_ID


class Follow(BaseModel):
    entity_type: Literal["FOLLOW"] = "FOLLOW"
    follower_user_id: str
    target_user_id: str
    created_at: str
    institution_id: str = INSTITUTION_ID


class Block(BaseModel):
    entity_type: Literal["BLOCK"] = "BLOCK"
    blocker_user_id: str
    target_user_id: str
    created_at: str
    institution_id: str = INSTITUTION_ID


class Vote(BaseModel):
    entity_type: Literal["VOTE"] = "VOTE"
    content_id: str
    user_id: str
    value: Literal[1] = 1
    created_at: str
    institution_id: str = INSTITUTION_ID


class Report(BaseModel):
    entity_type: Literal["REPORT"] = "REPORT"
    report_id: str
    content_id: str
    reporter_user_id: str
    reason: str
    note: str = ""
    state: ReportState = ReportState.OPEN
    institution_id: str = INSTITUTION_ID
    created_at: str
    updated_at: str


class ReportCreate(BaseModel):
    content_id: str = Field(min_length=1)
    reason: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=500)


class Notification(BaseModel):
    entity_type: Literal["NOTIFICATION"] = "NOTIFICATION"
    notification_id: str
    recipient_user_id: str
    type: str
    content_id: str | None = None
    actor_user_id: str | None = None
    read: bool = False
    created_at: str
    institution_id: str = INSTITUTION_ID
