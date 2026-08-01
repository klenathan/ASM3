"""Moderation bounded context Postgres persistence (jobs, decisions, appeals, audit)."""

from __future__ import annotations

from sqlalchemy import select, update

from rmit_society.base import utc_now
from rmit_society.moderation.domain import Appeal, ModerationDecisionRecord, ModerationJob
from rmit_society.repositories.postgres_base import (
    Appeals,
    AuditEvents,
    Comments,
    ModerationDecisions,
    ModerationJobs,
    Posts,
    _as_dict,
    _dialect_insert,
    _dump,
    PostgresRepositoryBase,
)
from rmit_society.shared.events import AuditEvent

__all__ = ["ModerationRepository"]


class ModerationRepository(PostgresRepositoryBase):
    """Moderation, appeal, and audit persistence."""

    # ------------------------------------------------------------ moderation
    def create_job(self, job: ModerationJob) -> None:
        with self._session.begin() as session:
            self._upsert(session, ModerationJobs, _dump(job), [ModerationJobs.content_id])

    def get_job(self, content_id: str) -> ModerationJob | None:
        with self._session() as session:
            row = session.scalars(select(ModerationJobs).where(ModerationJobs.content_id == content_id)).first()
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
            post_rows = session.execute(select(Posts.post_id, Posts.created_at).where(Posts.state == state)).all()
            comment_rows = session.execute(
                select(Comments.comment_id, Comments.created_at).where(Comments.state == state)
            ).all()
        entries = [(str(row[0]), str(row[1])) for row in post_rows + comment_rows]
        entries.sort(key=lambda entry: entry[1])
        return [content_id for content_id, _created_at in entries]

    def create_appeal(self, appeal: Appeal) -> bool:
        with self._session.begin() as session:
            stmt = (
                _dialect_insert(self._engine, Appeals)
                .values(**_dump(appeal))
                .on_conflict_do_nothing(index_elements=[Appeals.appeal_id])
                .returning(Appeals.appeal_id)
            )
            return session.execute(stmt).scalar_one_or_none() is not None

    def get_appeal(self, appeal_id: str) -> Appeal | None:
        with self._session() as session:
            row = session.scalars(select(Appeals).where(Appeals.appeal_id == appeal_id)).first()
            return Appeal.model_validate(_as_dict(row)) if row else None

    def list_appeals(self, state: str) -> list[Appeal]:
        with self._session() as session:
            rows = session.scalars(
                select(Appeals).where(Appeals.state == state).order_by(Appeals.created_at.asc())
            ).all()
            return [Appeal.model_validate(_as_dict(row)) for row in rows]

    def update_appeal(self, appeal_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Appeals, Appeals.appeal_id == appeal_id, changes)

    def append_audit(self, event: AuditEvent) -> None:
        with self._session.begin() as session:
            session.execute(_dialect_insert(self._engine, AuditEvents).values(**_dump(event)).on_conflict_do_nothing())

    def list_audit(self, target_type: str, target_id: str) -> list[AuditEvent]:
        del target_type
        with self._session() as session:
            rows = session.scalars(
                select(AuditEvents)
                .where(AuditEvents.target_id == target_id)
                .order_by(AuditEvents.created_at.desc())
            ).all()
            return [AuditEvent.model_validate(_as_dict(row)) for row in rows]
