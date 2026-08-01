"""Compatibility exports; use rmit_society.content.models for new code."""
from rmit_society.content.models.comment import Comment, CommentCreate
from rmit_society.content.models.post import Post, PostCreate
from rmit_society.content.models.version import ContentVersion

__all__ = ["Post", "PostCreate", "Comment", "CommentCreate", "ContentVersion"]
