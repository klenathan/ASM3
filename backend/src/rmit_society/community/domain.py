"""Community bounded context: societies, posts/comments, and engagement.

This single context owns the school communities (societies), the content they
host (posts and threaded comments), and the engagement graph around that
content (votes, follows, blocks, reports, and notifications).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rmit_society.shared.constants import INSTITUTION_ID
from rmit_society.shared.enums import ContentState, ReportState

__all__ = [
    "Society",
    "SocietyMembership",
    "SocietyCreate",
    "SocietyUpdate",
    "Post",
    "Comment",
    "ContentVersion",
    "PostCreate",
    "CommentCreate",
    "Follow",
    "Block",
    "Vote",
    "Report",
    "ReportCreate",
    "Notification",
]


# --------------------------------------------------------------------------- #
# Societies (school communities / spaces)
# --------------------------------------------------------------------------- #


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


# --------------------------------------------------------------------------- #
# Content (posts and threaded comments)
# --------------------------------------------------------------------------- #


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


# --------------------------------------------------------------------------- #
# Engagement (votes, follows, blocks, reports, notifications)
# --------------------------------------------------------------------------- #


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
