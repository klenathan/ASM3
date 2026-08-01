"""Tests for the repository factory driver selection."""

from __future__ import annotations

from rmit_society.config import get_settings
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.repositories.factory import get_repository, reset_repository
from rmit_society.repositories.postgres import PostgresRepository


def test_default_driver_is_dynamodb_under_legacy_suite() -> None:
    # conftest pins DATABASE_DRIVER=dynamodb for the AWS-backed suite.
    assert get_settings().database_driver == "dynamodb"
    repo = get_repository()
    assert isinstance(repo, DynamoDBRepository)


def test_postgres_driver_selected(monkeypatch) -> None:
    reset_repository()
    get_settings.cache_clear()
    monkeypatch.setenv("DATABASE_DRIVER", "postgres")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    repo = get_repository()
    assert isinstance(repo, PostgresRepository)
    reset_repository()


def test_reset_repository_rebuilds() -> None:
    reset_repository()
    first = get_repository()
    reset_repository()
    second = get_repository()
    assert first is not second
