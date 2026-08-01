"""Community bounded context (societies, content, engagement) Postgres persistence."""

from __future__ import annotations

from sqlalchemy import delete, select, update

from rmit_society.base import utc_now
from rmit_society.community.domain import (
    Block,
    Comment,
    ContentVersion,
    Follow,
    Notification,
    Post,
    Report,
    Society,
    SocietyMembership,
    Vote,
)
from rmit_society.repositories.postgres_base import (
    _COUNTER_FIELDS,
    Blocks,
    Comments,
    ContentVersions,
    FeedEntries,
    Follows,
    Notifications,
    PostgresRepositoryBase,
    Posts,
    Reports,
    SlugReservations,
    Societies,
    SocietyMemberships,
    Votes,
    _as_dict,
    _dialect_insert,
    _dump,
)

__all__ = ["CommunityRepository"]


class CommunityRepository(PostgresRepositoryBase):
    """Society, content, engagement, and feed persistence."""

    # -------------------------------------------------------------- societies
    def create_society(self, society: Society) -> None:
        data = _dump(society)
        data["slug_lower"] = society.slug.lower()
        with self._session.begin() as session:
            self._upsert(session, Societies, data, [Societies.society_id])

    def get_society(self, society_id: str) -> Society | None:
        with self._session() as session:
            row = session.scalars(
                select(Societies).where(Societies.society_id == society_id)
            ).first()
            return Society.model_validate(_as_dict(row)) if row else None

    def get_society_by_slug(self, slug: str) -> Society | None:
        with self._session() as session:
            row = session.scalars(
                select(Societies).where(Societies.slug_lower == slug.lower())
            ).first()
            return Society.model_validate(_as_dict(row)) if row else None

    def update_society(self, society_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Societies,
                         Societies.society_id == society_id, changes)

    def list_societies(self) -> list[Society]:
        with self._session() as session:
            rows = session.scalars(select(Societies)).all()
            return [Society.model_validate(_as_dict(row)) for row in rows]

    def reserve_slug(self, slug: str, society_id: str) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session, SlugReservations, {
                    "slug_lower": slug.lower(), "society_id": society_id}
            )

    def join(self, membership: SocietyMembership) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session,
                SocietyMemberships,
                {
                    "society_id": membership.society_id,
                    "user_id": membership.user_id,
                    "is_moderator": membership.is_moderator,
                    "joined_at": membership.joined_at,
                },
            )

    def leave(self, society_id: str, user_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                delete(SocietyMemberships).where(
                    SocietyMemberships.society_id == society_id,
                    SocietyMemberships.user_id == user_id,
                )
            )

    def is_member(self, society_id: str, user_id: str) -> bool:
        with self._session() as session:
            row = session.execute(
                select(SocietyMemberships.society_id).where(
                    SocietyMemberships.society_id == society_id,
                    SocietyMemberships.user_id == user_id,
                )
            ).first()
            return row is not None

    def is_moderator(self, society_id: str, user_id: str) -> bool:
        with self._session() as session:
            row = (
                session.execute(
                    select(SocietyMemberships.is_moderator)
                    .where(
                        SocietyMemberships.society_id == society_id,
                        SocietyMemberships.user_id == user_id,
                    )
                )
                .first()
            )
            return bool(row and row[0])

    def list_members(self, society_id: str) -> list[SocietyMembership]:
        with self._session() as session:
            rows = session.scalars(
                select(SocietyMemberships).where(
                    SocietyMemberships.society_id == society_id)
            ).all()
            return [SocietyMembership.model_validate(_as_dict(row)) for row in rows]

    def list_joined(self, user_id: str) -> list[SocietyMembership]:
        with self._session() as session:
            rows = session.scalars(
                select(SocietyMemberships).where(
                    SocietyMemberships.user_id == user_id)
            ).all()
            return [SocietyMembership.model_validate(_as_dict(row)) for row in rows]

    def set_moderator(self, society_id: str, user_id: str, is_moderator: bool) -> bool:
        with self._session.begin() as session:
            result = session.execute(
                update(SocietyMemberships)
                .where(
                    SocietyMemberships.society_id == society_id,
                    SocietyMemberships.user_id == user_id,
                )
                .values(is_moderator=is_moderator)
            )
            return bool(result.rowcount)

    def increment_members(self, society_id: str, delta: int) -> None:
        with self._session.begin() as session:
            session.execute(
                update(Societies)
                .where(Societies.society_id == society_id)
                .values(member_count=Societies.member_count + delta)
            )

    # --------------------------------------------------------------- content
    def create_post(self, post: Post) -> None:
        with self._session.begin() as session:
            self._upsert(session, Posts, _dump(post), [Posts.post_id])

    def get_post(self, post_id: str) -> Post | None:
        with self._session() as session:
            row = session.scalars(select(Posts).where(
                Posts.post_id == post_id)).first()
            return Post.model_validate(_as_dict(row)) if row else None

    def update_post(self, post_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Posts, Posts.post_id == post_id, changes)

    def get_post_by_society_pinned(self, society_id: str) -> list[Post]:
        with self._session() as session:
            rows = session.scalars(
                select(Posts)
                .where(Posts.society_id == society_id, Posts.pinned.is_(True))
                .order_by(Posts.created_at.desc())
            ).all()
            return [Post.model_validate(_as_dict(row)) for row in rows]

    def create_comment(self, comment: Comment) -> None:
        with self._session.begin() as session:
            self._upsert(session, Comments, _dump(
                comment), [Comments.comment_id])

    def get_comment(self, comment_id: str) -> Comment | None:
        with self._session() as session:
            row = session.scalars(select(Comments).where(
                Comments.comment_id == comment_id)).first()
            return Comment.model_validate(_as_dict(row)) if row else None

    def update_comment(self, comment_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Comments, Comments.comment_id ==
                         comment_id, changes)

    def list_comments(self, post_id: str) -> list[Comment]:
        with self._session() as session:
            rows = session.scalars(
                select(Comments).where(Comments.post_id ==
                                       post_id).order_by(Comments.path.asc())
            ).all()
            return [Comment.model_validate(_as_dict(row)) for row in rows]

    def save_version(self, version: ContentVersion) -> None:
        with self._session.begin() as session:
            self._upsert(
                session,
                ContentVersions,
                _dump(version),
                [ContentVersions.content_id, ContentVersions.version],
            )

    def transition_state(
        self, content_id: str, expected: str, new_state: str, **changes: object
    ) -> bool:
        safe = self._filter_changes(changes)
        with self._session.begin() as session:
            result = session.execute(
                update(Posts)
                .where(Posts.post_id == content_id, Posts.state == expected)
                .values(state=new_state, updated_at=utc_now(), **safe)
            )
            if result.rowcount:
                return True
            result = session.execute(
                update(Comments)
                .where(Comments.comment_id == content_id, Comments.state == expected)
                .values(state=new_state, updated_at=utc_now(), **safe)
            )
            return bool(result.rowcount)

    def increment_counter(self, content_id: str, field: str, delta: int) -> None:
        if field not in _COUNTER_FIELDS:
            raise ValueError(f"Unsupported counter field: {field}")
        with self._session.begin() as session:
            result = session.execute(
                update(Posts)
                .where(Posts.post_id == content_id)
                .values({field: getattr(Posts, field) + delta})
            )
            if not result.rowcount:
                session.execute(
                    update(Comments)
                    .where(Comments.comment_id == content_id)
                    .values({field: getattr(Comments, field) + delta})
                )

    # ------------------------------------------------------------ engagement
    def put_vote(self, vote: Vote) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session,
                Votes,
                {
                    "content_id": vote.content_id,
                    "user_id": vote.user_id,
                    "value": vote.value,
                    "created_at": vote.created_at,
                    "institution_id": vote.institution_id,
                },
            )

    def delete_vote(self, content_id: str, user_id: str) -> bool:
        with self._session.begin() as session:
            result = session.execute(
                delete(Votes).where(Votes.content_id ==
                                    content_id, Votes.user_id == user_id)
            )
            return bool(result.rowcount)

    def put_follow(self, follow: Follow) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session,
                Follows,
                {
                    "follower_user_id": follow.follower_user_id,
                    "target_user_id": follow.target_user_id,
                    "created_at": follow.created_at,
                    "institution_id": follow.institution_id,
                },
            )

    def delete_follow(self, follower_user_id: str, target_user_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                delete(Follows).where(
                    Follows.follower_user_id == follower_user_id,
                    Follows.target_user_id == target_user_id,
                )
            )

    def put_block(self, block: Block) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session,
                Blocks,
                {
                    "blocker_user_id": block.blocker_user_id,
                    "target_user_id": block.target_user_id,
                    "created_at": block.created_at,
                    "institution_id": block.institution_id,
                },
            )

    def delete_block(self, blocker_user_id: str, target_user_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                delete(Blocks).where(
                    Blocks.blocker_user_id == blocker_user_id,
                    Blocks.target_user_id == target_user_id,
                )
            )

    def create_report(self, report: Report) -> bool:
        with self._session.begin() as session:
            stmt = (
                _dialect_insert(self._engine, Reports)
                .values(**_dump(report))
                .on_conflict_do_nothing(
                    index_elements=[Reports.content_id,
                                    Reports.reporter_user_id]
                )
                .returning(Reports.report_id)
            )
            return session.execute(stmt).scalar_one_or_none() is not None

    def list_open_reports(self, state: str = "OPEN") -> list[Report]:
        with self._session() as session:
            rows = session.scalars(
                select(Reports).where(Reports.state == state).order_by(
                    Reports.created_at.asc())
            ).all()
            return [Report.model_validate(_as_dict(row)) for row in rows]

    def resolve_report(self, report_id: str, state: str) -> None:
        with self._session.begin() as session:
            session.execute(
                update(Reports)
                .where(Reports.report_id == report_id)
                .values(state=state, updated_at=utc_now())
            )

    def create_notification(self, notification: Notification) -> None:
        with self._session.begin() as session:
            self._upsert(
                session, Notifications, _dump(notification), [
                    Notifications.notification_id]
            )

    def list_notifications(
        self, user_id: str, *, limit: int = 50, cursor: str | None = None
    ) -> list[Notification]:
        del cursor  # Cursor token is added by the feed/query adapter at API boundary.
        with self._session() as session:
            rows = session.scalars(
                select(Notifications)
                .where(Notifications.recipient_user_id == user_id)
                .order_by(Notifications.created_at.desc(), Notifications.notification_id.desc())
                .limit(max(1, min(limit, 100)))
            ).all()
            return [Notification.model_validate(_as_dict(row)) for row in rows]

    def mark_notification_read(self, notification_id: str, user_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                update(Notifications)
                .where(
                    Notifications.notification_id == notification_id,
                    Notifications.recipient_user_id == user_id,
                )
                .values(read=True)
            )

    # ----------------------------------------------------------------- feeds
    def add_feed_entry(
        self, feed_type: str, feed_id: str, content_id: str, published_at: str
    ) -> None:
        with self._session.begin() as session:
            session.execute(
                _dialect_insert(self._engine, FeedEntries)
                .values(
                    feed_type=feed_type,
                    feed_id=feed_id,
                    content_id=content_id,
                    published_at=published_at,
                    institution_id="rmit",
                )
                .on_conflict_do_update(
                    index_elements=[
                        FeedEntries.feed_type,
                        FeedEntries.feed_id,
                        FeedEntries.content_id,
                    ],
                    set_={"published_at": published_at},
                )
            )

    def remove_feed_entry(self, feed_type: str, feed_id: str, content_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                delete(FeedEntries).where(
                    FeedEntries.feed_type == feed_type,
                    FeedEntries.feed_id == feed_id,
                    FeedEntries.content_id == content_id,
                )
            )

    def list_feed(
        self, feed_type: str, feed_id: str, *, limit: int = 50, cursor: str | None = None
    ) -> list[str]:
        del cursor  # Cursor decoding belongs to controller/query service.
        with self._session() as session:
            rows = session.execute(
                select(FeedEntries.content_id)
                .where(FeedEntries.feed_type == feed_type, FeedEntries.feed_id == feed_id)
                .order_by(FeedEntries.published_at.desc(), FeedEntries.content_id.desc())
                .limit(max(1, min(limit, 100)))
            ).all()
            return [str(row[0]) for row in rows]

    def list_joined_societies(self, user_id: str) -> list[str]:
        with self._session() as session:
            rows = session.execute(
                select(SocietyMemberships.society_id).where(
                    SocietyMemberships.user_id == user_id)
            ).all()
            return [str(row[0]) for row in rows]

    def list_following(self, user_id: str) -> list[str]:
        with self._session() as session:
            rows = session.execute(
                select(Follows.target_user_id).where(
                    Follows.follower_user_id == user_id)
            ).all()
            return [str(row[0]) for row in rows]
