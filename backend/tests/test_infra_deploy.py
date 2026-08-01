from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

INFRA_DIR = Path(__file__).resolve().parents[2] / "infra"
sys.path.insert(0, str(INFRA_DIR))

from deploy import Infrastructure, Names  # noqa: E402


def _infrastructure(stage: str = "dev") -> Infrastructure:
    infrastructure = Infrastructure.__new__(Infrastructure)
    infrastructure.stage = stage
    infrastructure.region = "ap-southeast-2"
    infrastructure.endpoint_url = None
    infrastructure.names = Names(stage=stage, account_id="000000000000")
    infrastructure.partition = "aws"
    infrastructure.db_instance_class = "db.t4g.micro"
    infrastructure.db_engine_version = None
    return infrastructure


def test_app_environment_contains_private_service_configuration() -> None:
    environment = _infrastructure().app_environment(
        {
            "host": "database.internal",
            "port": 5432,
            "database_name": "rmit_society",
            "secret_arn": "arn:aws:secretsmanager:ap-southeast-2:000000000000:secret:db",
        },
        "https://dev.example.amplifyapp.com",
    )

    values = {item["name"]: item["value"] for item in environment}
    assert "AWS_ENDPOINT_URL" not in values
    assert "DATABASE_PASSWORD" not in values
    assert values["ENVIRONMENT"] == "dev"
    assert values["DATABASE_HOST"] == "database.internal"
    assert values["DATABASE_SECRET_ARN"].startswith("arn:aws:secretsmanager:")
    assert values["CORS_ORIGINS"] == "https://dev.example.amplifyapp.com"


def test_names_make_s3_bucket_globally_unique() -> None:
    names = Names(stage="prod", account_id="123456789012")

    assert names.media_bucket == "rmit-society-prod-123456789012-media"
    assert names.database == "rmit-society-prod-postgres"
    assert names.ecr_repository == "rmit-society-prod-backend"


def test_deployment_rejects_latest_or_wrong_repository() -> None:
    infrastructure = _infrastructure()
    repository = (
        "000000000000.dkr.ecr.ap-southeast-2.amazonaws.com/"
        "rmit-society-dev-backend"
    )

    infrastructure._validate_image("backend", f"{repository}:release-abc", repository)
    infrastructure._validate_image(
        "backend", f"{repository}@sha256:{'a' * 64}", repository
    )
    with pytest.raises(ValueError, match="immutable"):
        infrastructure._validate_image("backend", f"{repository}:latest", repository)
    with pytest.raises(ValueError, match="provisioned repository"):
        infrastructure._validate_image(
            "backend",
            "000000000000.dkr.ecr.ap-southeast-2.amazonaws.com/other:release-abc",
            repository,
        )


def test_latest_postgres_version_uses_highest_available_version() -> None:
    infrastructure = _infrastructure()

    class RdsClient:
        def describe_db_engine_versions(self, **kwargs: object) -> dict[str, Any]:
            assert kwargs["Engine"] == "postgres"
            return {
                "DBEngineVersions": [
                    {"EngineVersion": "16.8"},
                    {"EngineVersion": "17.4"},
                    {"EngineVersion": "17.10"},
                ]
            }

    infrastructure.aws = lambda service: RdsClient()  # type: ignore[method-assign]

    assert infrastructure.latest_postgres_version() == "17.10"


def test_roles_limit_database_secret_to_task_bootstrap() -> None:
    infrastructure = _infrastructure()
    policies: dict[str, dict[str, Any]] = {}

    def capture_role(name: str, policy: dict[str, Any]) -> str:
        policies[name] = policy
        return f"arn:aws:iam::000000000000:role/{name}"

    infrastructure._ensure_role = capture_role  # type: ignore[method-assign]
    infrastructure.ensure_roles(
        infrastructure.names.media_bucket,
        "arn:aws:secretsmanager:ap-southeast-2:000000000000:secret:database",
    )

    task_statements = policies[f"{infrastructure.names.prefix}-ecs-task"]["Statement"]
    execution_statements = policies[f"{infrastructure.names.prefix}-ecs-execution"][
        "Statement"
    ]
    actions = {
        action
        for statement in task_statements
        for action in (
            statement["Action"]
            if isinstance(statement["Action"], list)
            else [statement["Action"]]
        )
    }
    task_resources = {
        resource
        for statement in task_statements
        for resource in (
            statement["Resource"]
            if isinstance(statement["Resource"], list)
            else [statement["Resource"]]
        )
    }

    execution_actions = {
        action
        for statement in execution_statements
        for action in (
            statement["Action"]
            if isinstance(statement["Action"], list)
            else [statement["Action"]]
        )
    }

    assert "secretsmanager:GetSecretValue" not in actions
    assert "secretsmanager:GetSecretValue" in execution_actions
    assert "s3:PutObject" in actions
    assert f"arn:aws:s3:::{infrastructure.names.media_bucket}/*" in task_resources


def test_database_start_command_constructs_url_without_logging_secret() -> None:
    command = _infrastructure()._database_start_command()

    compile(command, "<fargate-start-command>", "exec")
    assert "DATABASE_USERNAME" in command
    assert "DATABASE_PASSWORD" in command
    assert "postgresql+psycopg://" in command
    assert "print" not in command
