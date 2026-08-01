"""Shared kernel: domain enums used across bounded contexts."""

from __future__ import annotations

from enum import StrEnum


class ContentState(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    FLAGGED = "FLAGGED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


class ContentType(StrEnum):
    POST = "POST"
    COMMENT = "COMMENT"


class ModerationDecision(StrEnum):
    APPROVE = "APPROVE"
    FLAG = "FLAG"
    REJECT = "REJECT"
    PENDING = "PENDING"


class ReportState(StrEnum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class AppealState(StrEnum):
    OPEN = "OPEN"
    UPHELD = "UPHELD"
    REVERSED = "REVERSED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class NotificationType(StrEnum):
    REPLY = "REPLY"
    FOLLOW = "FOLLOW"
    MODERATION = "MODERATION"
    APPEAL = "APPEAL"
    ANNOUNCEMENT = "ANNOUNCEMENT"


class ModerationCategory(StrEnum):
    NUDITY = "nudity"
    HATE = "hate"
    HARASSMENT = "harassment"
    SEXUAL = "sexual"
    VIOLENCE = "violence"
    GRAPHIC = "graphic"
    PROFANITY = "profanity"
    SPAM = "spam"
    SAFE = "safe"
    UNSUPPORTED = "unsupported"
