"""Identity bounded context Postgres persistence."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from rmit_society.identity.domain import User
from rmit_society.repositories.postgres_base import (
    CognitoLinks,
    HandleReservations,
    IdempotencyRecords,
    PostgresRepositoryBase,
    Users,
    _as_dict,
    _dialect_insert,
    _dump,
)

__all__ = ["IdentityRepository"]


class IdentityRepository(PostgresRepositoryBase):
    """User profile and idempotency persistence."""

    # ------------------------------------------------------------------ users
    def get_user(self, user_id: str) -> User | None:
        with self._session() as session:
            row = session.scalars(select(Users).where(Users.user_id == user_id)).first()
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
            self._insert(session, CognitoLinks, {"cognito_sub": cognito_sub, "user_id": user_id})

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

    # ------------------------------------------------------------ idempotency
    def claim(self, key: str, response: dict[str, object]) -> dict[str, object] | None:
        session = self._session()
        try:
            session.execute(
                _dialect_insert(self._engine, IdempotencyRecords).values(
                    idempotency_key=key, response=response
                )
            )
            session.commit()
            return None
        except IntegrityError:
            session.rollback()
            row = session.execute(
                select(IdempotencyRecords).where(IdempotencyRecords.idempotency_key == key)
            ).first()
            return cast(dict[str, object], row[0].response) if row else {}
        finally:
            session.close()

    def get(self, key: str) -> dict[str, object] | None:
        with self._session() as session:
            row = session.execute(
                select(IdempotencyRecords).where(IdempotencyRecords.idempotency_key == key)
            ).first()
            return cast(dict[str, object], row[0].response) if row else None
