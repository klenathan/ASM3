from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.domain.users import INSTITUTION_ID


class Society(BaseModel):
    entity_type: Literal["SOCIETY"] = "SOCIETY"
    society_id: str
    slug: str
    name: str
    description: str = ""
    rules: str = ""
    owner_user_id: str
    institution_id: str = INSTITUTION_ID
    member_count: int = 0
    created_at: str
    updated_at: str


class SocietyMembership(BaseModel):
    entity_type: Literal["SOCIETY_MEMBERSHIP"] = "SOCIETY_MEMBERSHIP"
    society_id: str
    user_id: str
    is_moderator: bool = False
    joined_at: str


class SocietyCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    rules: str = Field(default="", max_length=2000)


class SocietyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    rules: str | None = Field(default=None, max_length=2000)
