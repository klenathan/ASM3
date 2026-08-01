"""PostgreSQL repository composing the per-context persistence mixins.

The DynamoDB single-table design is replaced here with a relational schema.
Every table is keyed by opaque server-generated IDs, timestamps remain UTC
ISO-8601 strings at the API boundary (matching the domain models), and JSON
columns carry the small structured payloads (moderation labels, audit
before/after snapshots, idempotency responses) that DynamoDB stored as maps.

The repository is driver-agnostic: it runs against RDS PostgreSQL in
deployment and against SQLite in-memory in host tests, so repository tests
need no live AWS or paid services.

Each bounded context contributes a mixin class (see ``postgres_identity``,
``postgres_community``, ``postgres_moderation``, ``postgres_media``); this
module composes them and re-exports the declarative ``Base`` for tooling
(e.g. Alembic).
"""

from __future__ import annotations

from rmit_society.repositories.postgres_base import Base
from rmit_society.repositories.postgres_community import CommunityRepository
from rmit_society.repositories.postgres_identity import IdentityRepository
from rmit_society.repositories.postgres_media import MediaRepository
from rmit_society.repositories.postgres_moderation import ModerationRepository

__all__ = ["Base", "PostgresRepository"]


class PostgresRepository(
    IdentityRepository,
    CommunityRepository,
    ModerationRepository,
    MediaRepository,
):
    """Full Repository implementation used by the application services."""
