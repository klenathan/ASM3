from __future__ import annotations

from rmit_society.base import new_id, utc_now
from rmit_society.config import get_settings
from rmit_society.domain.content import Comment, CommentCreate, ContentVersion, Post, PostCreate
from rmit_society.domain.enums import ContentState
from rmit_society.errors import (
    AuthorizationError,
    NotFoundError,
    ValidationError_,
)
from rmit_society.providers.queues import SQSQueuePublisher
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import feeds


def _require_editable(user_id: str, author_user_id: str, created_at: str, window_s: int) -> None:
    if user_id != author_user_id:
        raise AuthorizationError("Only the author may edit this content")
    import time
    from datetime import datetime

    created = datetime.fromisoformat(created_at).timestamp() if created_at else time.time()
    if time.time() - created > window_s:
        raise ValidationError_("Edit window has expired")


class ContentService:
    def __init__(
        self, repo: DynamoDBRepository, publisher: SQSQueuePublisher | None = None
    ) -> None:
        self.repo = repo
        self.publisher = publisher or SQSQueuePublisher()

    def _enqueue_content(self, content_id: str, content_type: str, version: int) -> None:
        self.publisher.publish(
            "ContentSubmitted.v1",
            1,
            {"content_id": content_id, "content_type": content_type, "version": version},
        )

    def create_post(
        self,
        *,
        author_user_id: str,
        society_id: str,
        society_slug: str,
        payload: PostCreate,
        institution_id: str = "rmit",
    ) -> Post:
        membership = self.repo.is_member(society_id, author_user_id)
        if not membership and society_slug != "rmit":
            raise AuthorizationError("Join this society before posting")
        now = utc_now()
        post = Post(
            post_id=new_id("p"),
            author_user_id=author_user_id,
            society_id=society_id,
            institution_id=institution_id,
            title=payload.title,
            body=payload.body,
            state=ContentState.PENDING,
            media_id=payload.media_id,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self.repo.create_post(post)
        self.repo.save_version(
            ContentVersion(
                content_id=post.post_id,
                content_type="post",
                version=1,
                body=post.body,
                media_id=post.media_id,
                state=ContentState.PENDING,
                created_at=now,
            )
        )
        self._enqueue_content(post.post_id, "post", 1)
        return post

    def get_post(self, post_id: str, *, actor_user_id: str, moderator: bool = False) -> Post:
        post = self.repo.get_post(post_id)
        if post is None or post.deleted:
            raise NotFoundError("Post not found")
        if (
            not moderator
            and post.state not in (ContentState.APPROVED, ContentState.FLAGGED)
            and post.author_user_id != actor_user_id
        ):
            raise NotFoundError("Post not found")
        return post

    def create_comment(
        self,
        *,
        post_id: str,
        author_user_id: str,
        payload: CommentCreate,
        parent_comment_id: str | None = None,
        depth: int = 0,
        institution_id: str = "rmit",
    ) -> Comment:
        settings = get_settings()
        post = self.repo.get_post(post_id)
        if post is None or post.deleted:
            raise NotFoundError("Post not found")
        society = self.repo.get_society(post.society_id)
        is_home = bool(society and society.slug == "rmit")
        if not self.repo.is_member(post.society_id, author_user_id) and not is_home:
            raise AuthorizationError("Join this society before commenting")
        if depth > settings.max_comment_depth:
            raise ValidationError_("Comment nesting is too deep")
        path = self._new_path(parent_comment_id, depth)
        now = utc_now()
        comment = Comment(
            comment_id=new_id("c"),
            post_id=post_id,
            author_user_id=author_user_id,
            institution_id=institution_id,
            parent_comment_id=parent_comment_id,
            path=path,
            depth=depth,
            body=payload.body,
            state=ContentState.PENDING,
            media_id=payload.media_id,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self.repo.create_comment(comment)
        self.repo.save_version(
            ContentVersion(
                content_id=comment.comment_id,
                content_type="comment",
                version=1,
                body=comment.body,
                media_id=comment.media_id,
                state=ContentState.PENDING,
                created_at=now,
            )
        )
        self.repo.increment_counter(post_id, "reply_count", 1)
        self._enqueue_content(comment.comment_id, "comment", 1)
        return comment

    @staticmethod
    def _new_path(parent_comment_id: str | None, depth: int) -> str:
        if depth == 0:
            return new_id("p0")
        return f"{parent_comment_id}:{new_id('c')}"

    def get_comment(
        self, comment_id: str, *, actor_user_id: str, moderator: bool = False
    ) -> Comment:
        comment = self.repo.get_comment(comment_id)
        if comment is None or comment.deleted:
            raise NotFoundError("Comment not found")
        if (
            not moderator
            and comment.state not in (ContentState.APPROVED, ContentState.FLAGGED)
            and comment.author_user_id != actor_user_id
        ):
            raise NotFoundError("Comment not found")
        return comment

    def edit_post(self, *, post_id: str, user_id: str, body: str, title: str | None = None) -> Post:
        settings = get_settings()
        post = self.repo.get_post(post_id)
        if post is None or post.deleted:
            raise NotFoundError("Post not found")
        _require_editable(
            user_id, post.author_user_id, post.created_at, settings.post_edit_window_s
        )
        new_version = post.version + 1
        now = utc_now()
        self.repo.save_version(
            ContentVersion(
                content_id=post.post_id,
                content_type="post",
                version=new_version,
                body=post.body,
                media_id=post.media_id,
                state=post.state,
                created_at=now,
            )
        )
        self.repo.update_post(
            post_id,
            body=body,
            version=new_version,
            state=ContentState.PENDING.value,
            updated_at=now,
            **({"title": title} if title is not None else {}),
        )
        self._reindex_to_pending(post_id)
        self._enqueue_content(post.post_id, "post", new_version)
        updated = self.repo.get_post(post_id)
        return updated if updated is not None else post

    def edit_comment(self, *, comment_id: str, user_id: str, body: str) -> Comment:
        settings = get_settings()
        comment = self.repo.get_comment(comment_id)
        if comment is None or comment.deleted:
            raise NotFoundError("Comment not found")
        _require_editable(
            user_id, comment.author_user_id, comment.created_at, settings.comment_edit_window_s
        )
        new_version = comment.version + 1
        now = utc_now()
        self.repo.save_version(
            ContentVersion(
                content_id=comment.comment_id,
                content_type="comment",
                version=new_version,
                body=comment.body,
                media_id=comment.media_id,
                state=comment.state,
                created_at=now,
            )
        )
        self.repo.update_comment(
            comment_id,
            body=body,
            version=new_version,
            state=ContentState.PENDING.value,
            updated_at=now,
        )
        self._reindex_to_pending(comment_id)
        self._enqueue_content(comment.comment_id, "comment", new_version)
        updated = self.repo.get_comment(comment_id)
        return updated if updated is not None else comment

    def _reindex_to_pending(self, content_id: str) -> None:
        # Recreate mod-queue projection now that content is PENDING again.
        self.repo.transition_state(content_id, "APPROVED", "PENDING") or self.repo.transition_state(
            content_id, "FLAGGED", "PENDING"
        )

    def delete_post(self, *, post_id: str, user_id: str, moderator: bool = False) -> None:
        post = self.repo.get_post(post_id)
        if post is None:
            raise NotFoundError("Post not found")
        if not moderator and post.author_user_id != user_id:
            raise AuthorizationError("Only the author may delete this post")
        self.repo.update_post(post_id, deleted=True, updated_at=utc_now())
        feeds.suppress_post(self.repo, post)

    def delete_comment(self, *, comment_id: str, user_id: str, moderator: bool = False) -> None:
        comment = self.repo.get_comment(comment_id)
        if comment is None:
            raise NotFoundError("Comment not found")
        if not moderator and comment.author_user_id != user_id:
            raise AuthorizationError("Only the author may delete this comment")
        self.repo.update_comment(comment_id, deleted=True, updated_at=utc_now())

    def moderate_delete(
        self,
        *,
        post_id: str | None = None,
        comment_id: str | None = None,
        moderator_user_id: str,
        society_id: str,
    ) -> None:
        if not self.repo.is_moderator(society_id, moderator_user_id):
            raise AuthorizationError("Moderator role required")
        if post_id:
            post = self.repo.get_post(post_id)
            self.repo.update_post(
                post_id, removed_by_moderator=True, deleted=True, updated_at=utc_now()
            )
            if post:
                feeds.suppress_post(self.repo, post)
        if comment_id:
            self.repo.update_comment(
                comment_id, removed_by_moderator=True, deleted=True, updated_at=utc_now()
            )

    def toggle_lock(self, *, post_id: str, user_id: str, society_id: str, locked: bool) -> Post:
        if not self.repo.is_moderator(society_id, user_id):
            raise AuthorizationError("Moderator role required")
        self.repo.update_post(post_id, locked=locked)
        post = self.repo.get_post(post_id)
        if post is None:
            raise NotFoundError("Post not found")
        return post

    def set_pin(self, *, post_id: str, user_id: str, society_id: str, pinned: bool) -> Post:
        if not self.repo.is_moderator(society_id, user_id):
            raise AuthorizationError("Moderator role required")
        self.repo.update_post(post_id, pinned=pinned)
        post = self.repo.get_post(post_id)
        if post is None:
            raise NotFoundError("Post not found")
        return post
