"""Temporary test compatibility adapter.

Runtime composition is PostgreSQL-only. Kept while downstream tests migrate.
"""
from sqlalchemy import StaticPool, create_engine

from rmit_society.repositories.postgres import PostgresRepository


class DynamoDBRepository(PostgresRepository):
    def __init__(self) -> None:
        super().__init__(
            "sqlite://",
            engine=create_engine(
                "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
            ),
        )

__all__ = ["DynamoDBRepository"]
