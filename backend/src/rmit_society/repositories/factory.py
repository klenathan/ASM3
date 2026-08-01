"""Repository factory selecting the active database driver.

``DATABASE_DRIVER`` chooses between the legacy DynamoDB single-table
implementation and the PostgreSQL implementation used on RDS. The rest of the
application consumes the :class:`Repository` protocol and never imports a
concrete driver, so the switch is a configuration change.
"""

from __future__ import annotations

from rmit_society.config import get_settings

from rmit_society.repositories.interfaces import Repository
from rmit_society.repositories.postgres import PostgresRepository

_repository: Repository | None = None


def get_repository() -> Repository:
    """Return the process-wide repository for the configured driver."""
    global _repository
    if _repository is None:
        settings = get_settings()

        _repository = PostgresRepository(
            settings.database_url,
            auto_create=settings.database_auto_create,
        )
    return _repository


def reset_repository() -> None:
    """Drop the cached repository (used by tests that switch drivers)."""
    global _repository
    _repository = None


__all__ = ["get_repository", "reset_repository"]
