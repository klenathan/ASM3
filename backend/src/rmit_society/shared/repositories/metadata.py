"""Alembic metadata aggregation point.

Context table modules can register with shared Base without Alembic knowing
about repository composition details. Legacy table modules remain imported
until each context adapter is moved completely.
"""
from rmit_society.repositories.postgres_base import Base

__all__ = ["Base"]
