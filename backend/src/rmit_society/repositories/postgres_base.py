"""Shared database primitives: declarative tables, helpers, and base repository.

Contains the SQLAlchemy table models, column-dump helpers, and the shared
``PostgresRepositoryBase`` (engine/session lifecycle plus insert/update
utilities). Per-context repository classes in ``postgres_identity``,
``postgres_community``, ``postgres_moderation``, and ``postgres_media`` mix
this base to keep each bounded context's persistence in one module.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    update,
)
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from rmit_society.base import utc_now

__all__ = ["Base", "PostgresRepositoryBase"]


class Base(DeclarativeBase):
    """Declarative base for all Postgres tables."""


# --------------------------------------------------------------------------- tables


class Users(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    cognito_sub: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    handle: Mapped[str] = mapped_column(String(64))
    handle_lower: Mapped[str] = mapped_column(String(64), unique=True, index=True)
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
    slug_lower: Mapped[str] = mapped_column(String(64), unique=True, index=True)
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
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
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
    parent_comment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    target_user_id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
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
        UniqueConstraint("content_id", "reporter_user_id", name="uq_report_guard"),
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
    actor_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    actor_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    reviewer_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))
    institution_id: Mapped[str] = mapped_column(String(32), default="rmit")


class AuditEvents(Base):
    __tablename__ = "audit_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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


# ------------------------------------------------------------------- helpers


def _dump(model: Any) -> dict[str, Any]:
    """Domain model to column dict, dropping the DynamoDB entity_type marker."""
    return {key: value for key, value in model.model_dump().items() if key != "entity_type"}


def _dialect_insert(engine: Engine, table: Any) -> Any:
    """Dialect-aware insert exposing ON CONFLICT (Postgres in prod, SQLite in tests)."""
    if engine.dialect.name == "sqlite":
        return sqlite.insert(table)
    return postgresql.insert(table)


def _as_dict(instance: Any) -> dict[str, Any]:
    """Serialize an ORM entity to a plain column dict for Pydantic validation."""
    return {column.name: getattr(instance, column.name) for column in instance.__table__.columns}


# ------------------------------------------------------------- base repository


class PostgresRepositoryBase:
    """Engine/session lifecycle plus shared insert/update utilities."""

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
        self._session: sessionmaker[Any] = sessionmaker(bind=self._engine, expire_on_commit=False)

    # ------------------------------------------------------------------ utils
    def _try_insert(self, session: Any, model: type[Any], values: dict[str, Any]) -> bool:
        """Insert-or-nothing returning whether a row was actually inserted.

        Uses RETURNING so it works reliably on both PostgreSQL and SQLite,
        where ``INSERT ... ON CONFLICT DO NOTHING`` may report ``rowcount``
        as -1 rather than 0 on a conflict.
        """
        pk = list(model.__table__.primary_key.columns)[0]
        stmt = (
            _dialect_insert(self._engine, model)
            .values(**values)
            .on_conflict_do_nothing()
            .returning(pk)
        )
        return session.execute(stmt).scalar_one_or_none() is not None

    def _insert(self, session: Any, table: Any, values: dict[str, Any]) -> Any:
        """Insert one row ignoring conflicts."""
        stmt = _dialect_insert(self._engine, table).values(**values)
        return session.execute(stmt.on_conflict_do_nothing())

    def _upsert(self, session: Any, model: type[Any], data: dict[str, Any], keys: list[Any]) -> None:
        stmt = _dialect_insert(self._engine, model).values(**data)
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=keys,
                set_={column: getattr(stmt.excluded, column) for column in data},
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
