from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.auth.claims import Role, UserStatus

INSTITUTION_ID = "rmit"


class User(BaseModel):
    entity_type: Literal["USER"] = "USER"
    user_id: str
    cognito_sub: str
    handle: str
    display_name: str = "Member"
    bio: str = ""
    major: str = ""
    role: Role = Role.STUDENT
    status: UserStatus = UserStatus.ACTIVE
    institution_id: str = INSTITUTION_ID
    created_at: str
    updated_at: str


class UserProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    bio: str | None = Field(default=None, max_length=300)
    major: str | None = Field(default=None, max_length=80)
