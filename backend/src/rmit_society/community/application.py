"""Community bounded context: application services.

``SocietyService``, ``ContentService``, ``EngagementService``, and the feed
projection helpers together own the behavior of societies, content, and the
engagement graph. Services depend only on the persistence protocol
(:class:`rmit_society.repositories.interfaces.Repository`) and on the event
publisher (:class:`rmit_society.messaging.SQSQueuePublisher`).
"""

from __future__ import annotations

import time
from datetime import datetime

from rmit_society.base import new_id, utc_now
from rmit_society.community.domain import (
    Block,
    Comment,
    CommentCreate,
    ContentVersion,
    Follow,
    Notification,
    Post,
    PostCreate,
    Report,
    ReportCreate,
    Society,
    SocietyCreate,
    SocietyMembership,
    SocietyUpdate,
    Vote,
)
from rmit_society.config import get_settings
from rmit_society.errors import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError_,
)
from rmit_society.messaging import SQSQueuePublisher
from rmit_society.repositories.interfaces import Repository
from rmit_society.shared.enums import ContentState

__all__ = [
    "SocietyService",
    "ContentService",
    "EngagementService",
    "publish_post",
    "suppress_post",
    "school_feed",
    "society_feed",
    "author_feed",
    "joined_feed",
    "following_feed",
]


# --------------------------------------------------------------------------- #
# Feed projections
# --------------------------------------------------------------------------- #

FEED_RMIT = "RMIT"
FEED_SOCIETY = "SOCIETY"
FEED_AUTHOR = "AUTHOR"

_HOME_SOCIETY_ID = "rmit"


def publish_post(repo: Repository, post: Post) -> None:
    """Fan out feed projection records for approved/flagged posts."""
    repo.add_feed_entry(FEED_RMIT, "rmit", post.post_id, post.created_at)
    repo.add_feed_entry(FEED_AUTHOR, post.author_user_id, post.post_id, post.created_at)
    if post.society_id != _HOME_SOCIETY_ID:
        repo.add_feed_entry(FEED_SOCIETY, post.society_id, post.post_id, post.created_at)


def suppress_post(repo: Repository, post: Post) -> None:
    """Idempotently remove all feed projections for a post."""
    repo.remove_feed_entry(FEED_RMIT, "rmit", post.post_id)
    repo.remove_feed_entry(FEED_AUTHOR, post.author_user_id, post.post_id)
    if post.society_id != _HOME_SOCIETY_ID:
        repo.remove_feed_entry(FEED_SOCIETY, post.society_id, post.post_id)


def school_feed(repo: Repository) -> list[str]:
    return repo.list_feed(FEED_RMIT, "rmit")


def society_feed(repo: Repository, society_id: str) -> list[str]:
    return repo.list_feed(FEED_SOCIETY, society_id)


def author_feed(repo: Repository, author_user_id: str) -> list[str]:
    return repo.list_feed(FEED_AUTHOR, author_user_id)


def joined_feed(repo: Repository, user_id: str, *, include_home: bool = True) -> list[str]:
    seen: set[str] = set()
    if include_home:
        seen.update(school_feed(repo))
    for society_id in repo.list_joined_societies(user_id):
        seen.update(society_feed(repo, society_id))
    return _ordered(seen)


def following_feed(repo: Repository, user_id: str) -> list[str]:
    seen: set[str] = set()
    for target_user_id in repo.list_following(user_id):
        seen.update(author_feed(repo, target_user_id))
    return _ordered(seen)


def _ordered(content_ids: set[str]) -> list[str]:
    return list(content_ids)


# --------------------------------------------------------------------------- #
# Societies
# --------------------------------------------------------------------------- #


class SocietyService:
    """Application service for school communities / spaces."""

    @staticmethod
    def create(repo: Repository, *, actor_user_id: str, payload: SocietyCreate) -> Society:
        if not repo.reserve_slug(payload.slug, "pending"):
            raise ConflictError("Society slug is already taken")
        society_id = new_id("s")
        while repo.get_society(society_id) is not None:
            society_id = new_id("s")
        society = Society(
            society_id=society_id,
            slug=payload.slug,
            name=payload.name,
            description=payload.description,
            rules=payload.rules,
            owner_user_id=actor_user_id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        repo.create_society(society)
        membership = SocietyMembership(
            society_id=society_id, user_id=actor_user_id, is_moderator=True, joined_at=utc_now()
        )
        repo.join(membership)
        repo.increment_members(society_id, 1)
        return society

    @staticmethod
    def get(repo: Repository, slug: str) -> Society:
        society = repo.get_society_by_slug(slug)
        if society is None:
            raise NotFoundError("Society not found")
        return society

    @staticmethod
    def list_societies(repo: Repository) -> list[Society]:
        return repo.list_societies()

    @staticmethod
    def update(
        repo: Repository, *, society: Society, actor_user_id: str, payload: SocietyUpdate
    ) -> Society:
        if actor_user_id != society.owner_user_id and not repo.is_moderator(
            society.society_id, actor_user_id
        ):
            raise AuthorizationError("Only moderators may update this society")
        changes: dict[str, object] = {"updated_at": utc_now()}
        if payload.name is not None:
            changes["name"] = payload.name
        if payload.description is not None:
            changes["description"] = payload.description
        if payload.rules is not None:
            changes["rules"] = payload.rules
        repo.update_society(society.society_id, **changes)
        updated = repo.get_society(society.society_id)
        if updated is None:
            raise NotFoundError("Society not found")
        return updated

    @staticmethod
    def join(repo: Repository, *, society_id: str, user_id: str) -> None:
        membership = SocietyMembership(
            society_id=society_id, user_id=user_id, is_moderator=False, joined_at=utc_now()
        )
        if repo.join(membership):
            repo.increment_members(society_id, 1)

    @staticmethod
    def leave(repo: Repository, *, society_id: str, user_id: str) -> None:
        if repo.is_member(society_id, user_id):
            repo.leave(society_id, user_id)
            repo.increment_members(society_id, -1)

    @staticmethod
    def list_members(repo: Repository, society_id: str) -> list[SocietyMembership]:
        return repo.list_members(society_id)

    @staticmethod
    def set_moderator(
        repo: Repository,
        *,
        society_id: str,
        actor_user_id: str,
        target_user_id: str,
        is_moderator: bool,
    ) -> None:
        society = repo.get_society(society_id)
        if society is None:
            raise NotFoundError("Society not found")
        if actor_user_id != society.owner_user_id and not repo.is_moderator(
            society_id, actor_user_id
        ):
            raise AuthorizationError("Moderator role required")
        if not repo.is_member(society_id, target_user_id):
            raise NotFoundError("Target is not a member")
        if not repo.set_moderator(society_id, target_user_id, is_moderator):
            raise NotFoundError("Target not found")


# --------------------------------------------------------------------------- #
# Content (posts and comments)
# --------------------------------------------------------------------------- #


def _require_editable(
    user_id: str, author_user_id: str, created_at: str, window_s: int
) -> None:
    if user_id != author_user_id:
        raise AuthorizationError("Only the author may edit this content")
    created = datetime.fromisoformat(created_at).timestamp() if created_at else time.time()
    if time.time() - created > window_s:
        raise ValidationError_("Edit window has expired")


class ContentService:
    def __init__(
        self, repo: Repository, publisher: SQSQueuePublisher | None = None
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
        suppress_post(self.repo, post)

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
                suppress_post(self.repo, post)
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


# --------------------------------------------------------------------------- #
# Engagement (votes, follows, blocks, reports, notifications)
# --------------------------------------------------------------------------- #


class EngagementService:
    def __init__(
        self, repo: Repository, publisher: SQSQueuePublisher | None = None
    ) -> None:
        self.repo = repo
        self.publisher = publisher or SQSQueuePublisher()

    def vote(self, *, content_id: str, user_id: str) -> None:
        if self.repo.get_post(content_id) is None and self.repo.get_comment(content_id) is None:
            raise NotFoundError("Content not found")
        vote = Vote(
            content_id=content_id,
            user_id=user_id,
            value=1,
            created_at=utc_now(),
            institution_id="rmit",
        )
        if self.repo.put_vote(vote):
            self.repo.increment_counter(content_id, "vote_count", 1)

    def unvote(self, *, content_id: str, user_id: str) -> None:
        self.repo.delete_vote(content_id, user_id)
        self.repo.increment_counter(content_id, "vote_count", -1)

    def follow(self, *, target_user_id: str, follower_user_id: str) -> None:
        if follower_user_id == target_user_id:
            raise ConflictError("You cannot follow yourself")
        if self.repo.get_user(target_user_id) is None:
            raise NotFoundError("User not found")
        follow = Follow(
            follower_user_id=follower_user_id,
            target_user_id=target_user_id,
            created_at=utc_now(),
            institution_id="rmit",
        )
        if self.repo.put_follow(follow):
            self._notify(target_user_id, "FOLLOW", actor_user_id=follower_user_id)

    def unfollow(self, *, target_user_id: str, follower_user_id: str) -> None:
        self.repo.delete_follow(follower_user_id, target_user_id)

    def block(self, *, target_user_id: str, blocker_user_id: str) -> None:
        if blocker_user_id == target_user_id:
            raise ConflictError("You cannot block yourself")
        self.repo.put_block(
            Block(
                blocker_user_id=blocker_user_id,
                target_user_id=target_user_id,
                created_at=utc_now(),
                institution_id="rmit",
            )
        )

    def unblock(self, *, target_user_id: str, blocker_user_id: str) -> None:
        self.repo.delete_block(blocker_user_id, target_user_id)

    def report(self, *, reporter_user_id: str, payload: ReportCreate) -> Report:
        content = self.repo.get_post(payload.content_id) or self.repo.get_comment(
            payload.content_id
        )
        if content is None:
            raise NotFoundError("Content not found")
        report = Report(
            report_id=new_id("rep"),
            content_id=payload.content_id,
            reporter_user_id=reporter_user_id,
            reason=payload.reason,
            note=payload.note,
            created_at=utc_now(),
            updated_at=utc_now(),
            institution_id="rmit",
        )
        if not self.repo.create_report(report):
            raise ConflictError("You already have an open report for this content")
        return report

    def _notify(
        self,
        recipient: str,
        notification_type: str,
        *,
        actor_user_id: str,
        content_id: str | None = None,
    ) -> None:
        notification = Notification(
            notification_id=new_id("n"),
            recipient_user_id=recipient,
            type=notification_type,
            content_id=content_id,
            actor_user_id=actor_user_id,
            created_at=utc_now(),
            institution_id="rmit",
        )
        self.repo.create_notification(notification)

    def notify_reply(self, *, recipient: str, actor_user_id: str, content_id: str) -> None:
        self._notify(recipient, "REPLY", actor_user_id=actor_user_id, content_id=content_id)

    def notify_moderation(self, *, recipient: str, content_id: str) -> None:
        self._notify(recipient, "MODERATION", actor_user_id="system", content_id=content_id)

    def notify_appeal(self, *, recipient: str, content_id: str) -> None:
        self._notify(recipient, "APPEAL", actor_user_id="system", content_id=content_id)

    def list_notifications(self, user_id: str) -> list[Notification]:
        return self.repo.list_notifications(user_id)

    def mark_read(self, *, notification_id: str, user_id: str) -> None:
        self.repo.mark_notification_read(notification_id, user_id)
