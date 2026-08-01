from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.domain.enums import (
    AppealState,
    ModerationCategory,
    ModerationDecision,
    RiskLevel,
)
from rmit_society.domain.users import INSTITUTION_ID


class ModerationJob(BaseModel):
    entity_type: Literal["MODERATION_JOB"] = "MODERATION_JOB"
    content_id: str
    version: int
    provider: str
    state: str
    retries: int = 0
    decision: ModerationDecision = ModerationDecision.PENDING
    created_at: str
    updated_at: str


class LabelResult(BaseModel):
    category: ModerationCategory
    score: float = Field(ge=0, le=1)


class ModerationOutcome(BaseModel):
    decision: ModerationDecision
    risk_level: RiskLevel
    labels: list[LabelResult] = []
    provider: str
    model_version: str
    policy_version: str
    requires_warning: bool = False
    error: str | None = None


class ModerationDecisionRecord(BaseModel):
    entity_type: Literal["MODERATION_DECISION"] = "MODERATION_DECISION"
    content_id: str
    content_type: str
    version: int
    decision: ModerationDecision
    actor_type: str
    actor_user_id: str | None = None
    reason: str = ""
    labels: list[LabelResult] = []
    provider: str
    model_version: str
    policy_version: str
    risk_level: RiskLevel
    created_at: str
    institution_id: str = INSTITUTION_ID


class Appeal(BaseModel):
    entity_type: Literal["APPEAL"] = "APPEAL"
    appeal_id: str
    content_id: str
    content_type: str
    appellant_user_id: str
    context: str = ""
    state: AppealState = AppealState.OPEN
    decision_reason: str = ""
    reviewer_user_id: str | None = None
    created_at: str
    updated_at: str
    institution_id: str = INSTITUTION_ID


class AppealCreate(BaseModel):
    context: str = Field(default="", max_length=1000)


class ModerationReview(BaseModel):
    decision: ModerationDecision
    reason: str = Field(min_length=1, max_length=500)
    requires_warning: bool = False
