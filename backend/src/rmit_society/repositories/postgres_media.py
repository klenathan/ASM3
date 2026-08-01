"""Media bounded context Postgres persistence (uploads)."""

from __future__ import annotations

from sqlalchemy import select

from rmit_society.media.domain import Upload
from rmit_society.repositories.postgres_base import PostgresRepositoryBase, Uploads, _as_dict, _dump

__all__ = ["MediaRepository"]


class MediaRepository(PostgresRepositoryBase):
    """Media upload persistence."""

    def create_upload(self, upload: Upload) -> None:
        with self._session.begin() as session:
            self._upsert(session, Uploads, _dump(upload), [Uploads.upload_id])

    def get_upload(self, upload_id: str) -> Upload | None:
        with self._session() as session:
            row = session.scalars(select(Uploads).where(Uploads.upload_id == upload_id)).first()
            return Upload.model_validate(_as_dict(row)) if row else None

    def update_upload(self, upload_id: str, **changes: object) -> None:
        with self._session.begin() as session:
            self._update(session, Uploads, Uploads.upload_id == upload_id, changes)
