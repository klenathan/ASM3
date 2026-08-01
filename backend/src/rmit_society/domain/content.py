from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.domain.enums import ContentState
from rmit_society.domain.users import INSTITUTION_ID


class Post(BaseModel):
    entity_type: Literal["POST"] = "POST"
    post_id: str
    author_user_id: str
    society_id: str
    institution_id: str = INSTITUTION_ID
    title: str = ""
    body: str
    state: ContentState = ContentState.PENDING
    requires_warning: bool = False
    media_id: str | None = None
    pinned: bool = False
    locked: bool = False
    deleted: bool = False
    removed_by_moderator: bool = False
    version: int = 0
    reply_count: int = 0
    vote_count: int = 0
    created_at: str
    updated_at: str


class Comment(BaseModel):
    entity_type: Literal["COMMENT"] = "COMMENT"
    comment_id: str
    post_id: str
    author_user_id: str
    institution_id: str = INSTITUTION_ID
    parent_comment_id: str | None = None
    path: str
    depth: int = 0
    body: str
    state: ContentState = ContentState.PENDING
    requires_warning: bool = False
    media_id: str | None = None
    deleted: bool = False
    removed_by_moderator: bool = False
    version: int = 0
    reply_count: int = 0
    vote_count: int = 0
    created_at: str
    updated_at: str


class ContentVersion(BaseModel):
    entity_type: Literal["CONTENT_VERSION"] = "CONTENT_VERSION"
    content_id: str
    content_type: str
    version: int
    body: str
    media_id: str | None = None
    state: ContentState
    created_at: str


class PostCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    body: str = Field(min_length=1, max_length=2000)
    media_id: str | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    media_id: str | None = None
