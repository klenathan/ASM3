from __future__ import annotations

from enum import StrEnum
from typing import Any


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"


class Role(StrEnum):
    STUDENT = "STUDENT"
    STAFF = "STAFF"
    MODERATOR = "MODERATOR"
    RMIT_ADMIN = "RMIT_ADMIN"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class Claims:
    """Validated identity claims for the authenticated caller."""

    def __init__(
        self,
        *,
        subject: str,
        institution_id: str,
        role: Role,
        status: UserStatus,
        cognito_username: str = "",
    ) -> None:
        self.subject = subject
        self.institution_id = institution_id
        self.role = role
        self.status = status
        self.cognito_username = cognito_username

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE

    @property
    def is_admin(self) -> bool:
        return self.role in (Role.RMIT_ADMIN, Role.PLATFORM_ADMIN)

    @property
    def is_moderator(self) -> bool:
        return self.role in (Role.MODERATOR, Role.RMIT_ADMIN, Role.PLATFORM_ADMIN)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Claims:
        return cls(
            subject=str(data["subject"]),
            institution_id=str(data["institution_id"]),
            role=Role(data["role"]),
            status=UserStatus(data["status"]),
            cognito_username=str(data.get("cognito_username", "")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "subject": self.subject,
            "institution_id": self.institution_id,
            "role": self.role.value,
            "status": self.status.value,
            "cognito_username": self.cognito_username,
        }
