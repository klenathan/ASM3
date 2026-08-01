"""PostgreSQL repository implementing the application persistence protocols.

The DynamoDB single-table design is replaced here with a relational schema.
Every table is keyed by opaque server-generated IDs, timestamps remain UTC
ISO-8601 strings at the API boundary (matching the domain models), and JSON
columns carry the small structured payloads (moderation labels, audit
before/after snapshots, idempotency responses) that DynamoDB stored as maps.

The repository is driver-agnostic: it runs against RDS PostgreSQL in
deployment and against SQLite in-memory in host tests, so repository tests
need no live AWS or paid services.
"""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import (
    JSON,
    Boolean,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    delete,
    select,
    update,
)
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from rmit_society.base import utc_now
from rmit_society.domain.content import Comment, ContentVersion, Post
from rmit_society.domain.engagement import Block, Follow, Notification, Report, Vote
from rmit_society.domain.events import AuditEvent, Upload
from rmit_society.domain.moderation import Appeal, ModerationDecisionRecord, ModerationJob
from rmit_society.domain.societies import Society, SocietyMembership
from rmit_society.domain.users import User


class Base(DeclarativeBase):
    """Declarative base for all Postgres tables."""


# --------------------------------------------------------------------------- tables


class Users(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    cognito_sub: Mapped[str] = mapped_column(
        String(128), unique=True, index=True)
    handle: Mapped[str] = mapped_column(String(64))
    handle_lower: Mapped[str] = mapped_column(
        String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="Member")
    bio: Mapped[str] = mapped_column(Text, default="")
    major: Mapped[str] = mapped_column(String(80), default="")
    role: Mapped[str] = mapped_column(String(32), default="STUDENT")
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class CognitoLinks(Base):
    __tablename__ = "cognito_links"

    cognito_sub: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)


class HandleReservations(Base):
    __tablename__ = "handle_reservations"

    handle_lower: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64))


class Societies(Base):
    __tablename__ = "societies"

    society_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64))
    slug_lower: Mapped[str] = mapped_column(
        String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    rules: Mapped[str] = mapped_column(Text, default="")
    owner_user_id: Mapped[str] = mapped_column(String(64))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    member_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class SlugReservations(Base):
    __tablename__ = "slug_reservations"

    slug_lower: Mapped[str] = mapped_column(String(64), primary_key=True)
    society_id: Mapped[str] = mapped_column(String(64))


class SocietyMemberships(Base):
    __tablename__ = "society_memberships"

    society_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), primary_key=True, index=True)
    is_moderator: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[str] = mapped_column(String(40))


class Posts(Base):
    __tablename__ = "posts"

    post_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    author_user_id: Mapped[str] = mapped_column(String(64), index=True)
    society_id: Mapped[str] = mapped_column(String(64), index=True)
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16), index=True)
    requires_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    media_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    removed_by_moderator: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    vote_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class Comments(Base):
    __tablename__ = "comments"

    comment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    post_id: Mapped[str] = mapped_column(String(64), index=True)
    author_user_id: Mapped[str] = mapped_column(String(64), index=True)
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    parent_comment_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True)
    path: Mapped[str] = mapped_column(String(256))
    depth: Mapped[int] = mapped_column(Integer, default=0)
    body: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16), index=True)
    requires_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    media_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    removed_by_moderator: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    vote_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class ContentVersions(Base):
    __tablename__ = "content_versions"

    content_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_type: Mapped[str] = mapped_column(String(16))
    body: Mapped[str] = mapped_column(Text)
    media_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    state: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[str] = mapped_column(String(40))


class Votes(Base):
    __tablename__ = "votes"

    content_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class Follows(Base):
    __tablename__ = "follows"

    follower_user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_user_id: Mapped[str] = mapped_column(
        String(64), primary_key=True, index=True)
    created_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class Blocks(Base):
    __tablename__ = "blocks"

    blocker_user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class Reports(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("content_id", "reporter_user_id",
                         name="uq_report_guard"),
    )

    report_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content_id: Mapped[str] = mapped_column(String(64), index=True)
    reporter_user_id: Mapped[str] = mapped_column(String(64), index=True)
    reason: Mapped[str] = mapped_column(String(80))
    note: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(16), index=True)
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class Notifications(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    recipient_user_id: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(32))
    content_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_user_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class FeedEntries(Base):
    __tablename__ = "feed_entries"

    feed_type: Mapped[str] = mapped_column(String(16), primary_key=True)
    feed_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    published_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now)


class ModerationJobs(Base):
    __tablename__ = "moderation_jobs"

    content_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[int] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(String(32))
    state: Mapped[str] = mapped_column(String(16))
    retries: Mapped[int] = mapped_column(Integer, default=0)
    decision: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class ModerationDecisions(Base):
    __tablename__ = "moderation_decisions"

    content_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_type: Mapped[str] = mapped_column(String(16))
    decision: Mapped[str] = mapped_column(String(16))
    actor_type: Mapped[str] = mapped_column(String(16))
    actor_user_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    labels: Mapped[list[Any]] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(32))
    model_version: Mapped[str] = mapped_column(String(32))
    policy_version: Mapped[str] = mapped_column(String(16))
    risk_level: Mapped[str] = mapped_column(String(16))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class Appeals(Base):
    __tablename__ = "appeals"

    appeal_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content_id: Mapped[str] = mapped_column(String(64), index=True)
    content_type: Mapped[str] = mapped_column(String(16))
    appellant_user_id: Mapped[str] = mapped_column(String(64))
    context: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(16), index=True)
    decision_reason: Mapped[str] = mapped_column(Text, default="")
    reviewer_user_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class AuditEvents(Base):
    __tablename__ = "audit_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    before: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    after: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class Uploads(Base):
    __tablename__ = "uploads"

    upload_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String(64), index=True)
    society_id: Mapped[str] = mapped_column(String(64))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")
    declared_content_type: Mapped[str] = mapped_column(String(64))
    declared_size: Mapped[int] = mapped_column(Integer)
    quarantine_key: Mapped[str] = mapped_column(String(256))
    state: Mapped[str] = mapped_column(String(16), default="PENDING")
    media_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class IdempotencyRecords(Base):
    __tablename__ = "idempotency_records"

    idempotency_key: Mapped[str] = mapped_column(String(256), primary_key=True)
    response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now)


_COUNTER_FIELDS = frozenset({"reply_count", "vote_count"})


def _dump(model: Any) -> dict[str, Any]:
    """Domain model to column dict, dropping the DynamoDB entity_type marker."""
    return {key: value for key, value in model.model_dump().items() if key != "entity_type"}


def _insert(engine: Engine, table: Any) -> Any:
    """Dialect-aware insert exposing ON CONFLICT (Postgres in prod, SQLite in tests)."""
    if engine.dialect.name == "sqlite":
        return sqlite.insert(table)
    return postgresql.insert(table)


def _as_dict(instance: Any) -> dict[str, Any]:
    """Serialize an ORM entity to a plain column dict for Pydantic validation."""
    return {column.name: getattr(instance, column.name) for column in instance.__table__.columns}


# ------------------------------------------------------------------ repository


class PostgresRepository:
    """PostgreSQL-backed implementation of the Repository protocol."""

    def __init__(
        self,
        database_url: str,
        *,
        auto_create: bool = True,
        engine: Engine | None = None,
    ) -> None:
        self._engine = engine or create_engine(database_url)
        if auto_create:
            Base.metadata.create_all(self._engine)
        self._session: sessionmaker[Any] = sessionmaker(
            bind=self._engine, expire_on_commit=False)

    # ------------------------------------------------------------------ users
    def get_user(self, user_id: str) -> User | None:
        with self._session() as session:
            row = session.scalars(select(Users).where(
                Users.user_id == user_id)).first()
            return User.model_validate(_as_dict(row)) if row else None

    def get_user_by_cognito_sub(self, cognito_sub: str) -> User | None:
        with self._session() as session:
            row = session.scalars(
                select(Users)
                .join(CognitoLinks, CognitoLinks.user_id == Users.user_id)
                .where(CognitoLinks.cognito_sub == cognito_sub)
            ).first()
            return User.model_validate(_as_dict(row)) if row else None

    def link_cognito_sub(self, cognito_sub: str, user_id: str) -> None:
        with self._session.begin() as session:
            self._insert(session, CognitoLinks, {
                         "cognito_sub": cognito_sub, "user_id": user_id})

    def get_user_by_handle(self, handle: str) -> User | None:
        with self._session() as session:
            row = session.scalars(
                select(Users).where(Users.handle_lower == handle.lower())
            ).first()
            return User.model_validate(_as_dict(row)) if row else None

    def put_user(self, user: User) -> None:
        data = _dump(user)
        data["handle_lower"] = user.handle.lower()
        with self._session.begin() as session:
            self._upsert(session, Users, data, [Users.user_id])
            self._insert(
                session,
                CognitoLinks,
                {"cognito_sub": user.cognito_sub, "user_id": user.user_id},
            )

    def update_user(self, user_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Users, Users.user_id == user_id, changes)

    def reserve_handle(self, handle: str, user_id: str) -> bool:
        with self._session.begin() as session:
            return self._try_insert(
                session,
                HandleReservations,
                {"handle_lower": handle.lower(), "user_id": user_id},
            )

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
                session,
                SlugReservations,
                {"slug_lower": slug.lower(), "society_id": society_id},
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

    def delete_vote(self, content_id: str, user_id: str) -> None:
        with self._session.begin() as session:
            session.execute(
                delete(Votes).where(Votes.content_id ==
                                    content_id, Votes.user_id == user_id)
            )

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
                _insert(self._engine, Reports)
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
                session,
                Notifications,
                _dump(notification),
                [Notifications.notification_id],
            )

    def list_notifications(self, user_id: str) -> list[Notification]:
        with self._session() as session:
            rows = session.scalars(
                select(Notifications)
                .where(Notifications.recipient_user_id == user_id)
                .order_by(Notifications.created_at.desc())
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
                _insert(self._engine, FeedEntries)
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

    def list_feed(self, feed_type: str, feed_id: str) -> list[str]:
        with self._session() as session:
            rows = session.execute(
                select(FeedEntries.content_id)
                .where(FeedEntries.feed_type == feed_type, FeedEntries.feed_id == feed_id)
                .order_by(FeedEntries.published_at.desc())
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

    # ------------------------------------------------------------ moderation
    def create_job(self, job: ModerationJob) -> None:
        with self._session.begin() as session:
            self._upsert(session, ModerationJobs, _dump(
                job), [ModerationJobs.content_id])

    def get_job(self, content_id: str) -> ModerationJob | None:
        with self._session() as session:
            row = session.scalars(
                select(ModerationJobs).where(
                    ModerationJobs.content_id == content_id)
            ).first()
            return ModerationJob.model_validate(_as_dict(row)) if row else None

    def update_job_state(self, content_id: str, state: str, decision: str, retries: int) -> None:
        with self._session.begin() as session:
            session.execute(
                update(ModerationJobs)
                .where(ModerationJobs.content_id == content_id)
                .values(state=state, decision=decision, retries=retries, updated_at=utc_now())
            )

    def record_decision(self, decision: ModerationDecisionRecord) -> None:
        with self._session.begin() as session:
            self._upsert(
                session,
                ModerationDecisions,
                _dump(decision),
                [
                    ModerationDecisions.content_id,
                    ModerationDecisions.created_at,
                    ModerationDecisions.version,
                ],
            )

    def list_queue(self, state: str) -> list[str]:
        with self._session() as session:
            post_rows = session.execute(
                select(Posts.post_id, Posts.created_at).where(
                    Posts.state == state)
            ).all()
            comment_rows = session.execute(
                select(Comments.comment_id, Comments.created_at).where(
                    Comments.state == state)
            ).all()
        entries = [(str(row[0]), str(row[1]))
                   for row in post_rows + comment_rows]
        entries.sort(key=lambda entry: entry[1])
        return [content_id for content_id, _created_at in entries]

    def create_appeal(self, appeal: Appeal) -> bool:
        with self._session.begin() as session:
            stmt = (
                _insert(self._engine, Appeals)
                .values(**_dump(appeal))
                .on_conflict_do_nothing(index_elements=[Appeals.appeal_id])
                .returning(Appeals.appeal_id)
            )
            return session.execute(stmt).scalar_one_or_none() is not None

    def get_appeal(self, appeal_id: str) -> Appeal | None:
        with self._session() as session:
            row = session.scalars(select(Appeals).where(
                Appeals.appeal_id == appeal_id)).first()
            return Appeal.model_validate(_as_dict(row)) if row else None

    def list_appeals(self, state: str) -> list[Appeal]:
        with self._session() as session:
            rows = session.scalars(
                select(Appeals).where(Appeals.state == state).order_by(
                    Appeals.created_at.asc())
            ).all()
            return [Appeal.model_validate(_as_dict(row)) for row in rows]

    def update_appeal(self, appeal_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Appeals, Appeals.appeal_id ==
                         appeal_id, changes)

    def append_audit(self, event: AuditEvent) -> None:
        with self._session.begin() as session:
            session.execute(
                _insert(self._engine, AuditEvents).values(
                    **_dump(event)).on_conflict_do_nothing()
            )

    def list_audit(self, target_type: str, target_id: str) -> list[AuditEvent]:
        del target_type
        with self._session() as session:
            rows = session.scalars(
                select(AuditEvents)
                .where(AuditEvents.target_id == target_id)
                .order_by(AuditEvents.created_at.desc())
            ).all()
            return [AuditEvent.model_validate(_as_dict(row)) for row in rows]

    # ---------------------------------------------------------------- upload
    def create_upload(self, upload: Upload) -> None:
        with self._session.begin() as session:
            self._upsert(session, Uploads, _dump(upload), [Uploads.upload_id])

    def get_upload(self, upload_id: str) -> Upload | None:
        with self._session() as session:
            row = session.scalars(select(Uploads).where(
                Uploads.upload_id == upload_id)).first()
            return Upload.model_validate(_as_dict(row)) if row else None

    def update_upload(self, upload_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Uploads, Uploads.upload_id ==
                         upload_id, changes)

    # ------------------------------------------------------------ idempotency
    def claim(self, key: str, response: dict[str, object]) -> dict[str, object] | None:
        session = self._session()
        try:
            session.execute(
                _insert(self._engine, IdempotencyRecords).values(
                    idempotency_key=key, response=response
                )
            )
            session.commit()
            return None
        except IntegrityError:
            session.rollback()
            row = session.execute(
                select(IdempotencyRecords).where(
                    IdempotencyRecords.idempotency_key == key)
            ).first()
            return cast(dict[str, object], row[0].response) if row else {}
        finally:
            session.close()

    def get(self, key: str) -> dict[str, object] | None:
        with self._session() as session:
            row = session.execute(
                select(IdempotencyRecords).where(
                    IdempotencyRecords.idempotency_key == key)
            ).first()
            return cast(dict[str, object], row[0].response) if row else None

    # ------------------------------------------------------------------ utils
    def _try_insert(self, session: Any, model: type[Any], values: dict[str, Any]) -> bool:
        """Insert-or-nothing returning whether a row was actually inserted.

        Uses RETURNING so it works reliably on both PostgreSQL and SQLite,
        where ``INSERT ... ON CONFLICT DO NOTHING`` may report ``rowcount``
        as -1 rather than 0 on a conflict.
        """
        pk = list(model.__table__.primary_key.columns)[0]
        stmt = (
            _insert(self._engine, model)
            .values(**values)
            .on_conflict_do_nothing()
            .returning(pk)
        )
        return session.execute(stmt).scalar_one_or_none() is not None

    def _insert(self, session: Any, table: Any, values: dict[str, Any]) -> Any:
        """Insert one row ignoring conflicts (return value unused for boolean paths)."""
        stmt = _insert(self._engine, table).values(**values)
        return session.execute(stmt.on_conflict_do_nothing())

    def _upsert(
        self, session: Any, model: type[Any], data: dict[str, Any], keys: list[Any]
    ) -> None:
        stmt = _insert(self._engine, model).values(**data)
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=keys,
                set_={column: getattr(stmt.excluded, column)
                      for column in data},
            )
        )

    @staticmethod
    def _filter_changes(changes: dict[str, object]) -> dict[str, object]:
        return {
            key: value
            for key, value in changes.items()
            if not key.startswith("gsi_") and key != "entity_type"
        }

    @staticmethod
    def _update(
        session: Any,
        model: type[Any],
        where: Any,
        changes: dict[str, object],
    ) -> int:
        columns = set(model.__table__.columns.keys())
        safe = {key: value for key, value in changes.items() if key in columns}
        if not safe:
            return 0
        result = session.execute(update(model).where(where).values(**safe))
        return int(result.rowcount or 0)


__all__ = ["Base", "PostgresRepository"]
