from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

INFRA_DIR = Path(__file__).resolve().parents[2] / "infra"
sys.path.insert(0, str(INFRA_DIR))

from deploy import Infrastructure, Names  # noqa: E402


def _infrastructure(stage: str = "local") -> Infrastructure:
    infrastructure = Infrastructure.__new__(Infrastructure)
    infrastructure.stage = stage
    infrastructure.region = "ap-southeast-2"
    infrastructure.endpoint_url = "http://localhost:4566"
    infrastructure.names = Names(stage=stage, account_id="000000000000")
    infrastructure.partition = "aws"
    return infrastructure


def test_app_environment_keeps_local_providers_inside_local_stage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    environment = _infrastructure().app_environment(
        {"subnets": ["subnet-1"], "security_groups": ["sg-1"]},
        {"moderation": "moderation-url", "image": "image-url", "events": "events-url"},
    )

    values = {item["name"]: item["value"] for item in environment}
    assert values["AWS_ENDPOINT_URL"] == "http://ministack:4566"
    assert values["MODERATION_PROVIDER"] == "local"
    assert values["IMAGE_PROVIDER"] == "local"


def test_app_environment_uses_aws_moderation_outside_local_stage() -> None:
    infrastructure = _infrastructure("prod")
    infrastructure.endpoint_url = None
    environment = infrastructure.app_environment(
        {"subnets": ["subnet-1"], "security_groups": ["sg-1"]},
        {"moderation": "moderation-url", "image": "image-url", "events": "events-url"},
    )

    values = {item["name"]: item["value"] for item in environment}
    assert "AWS_ENDPOINT_URL" not in values
    assert values["MODERATION_PROVIDER"] == "aws"
    assert values["IMAGE_PROVIDER"] == "aws"


def test_ec2_role_can_pull_backend_image_and_query_indexes() -> None:
    infrastructure = _infrastructure()
    policies: dict[str, dict[str, Any]] = {}

    def capture_role(
        name: str, principals: list[str], policy: dict[str, Any]
    ) -> str:
        del principals
        policies[name] = policy
        return f"arn:aws:iam::000000000000:role/{name}"

    infrastructure.ensure_role = capture_role  # type: ignore[method-assign]
    infrastructure.ensure_roles()

    statements = policies[infrastructure.names.backend_role]["Statement"]
    actions = {
        action
        for statement in statements
        for action in (
            statement["Action"]
            if isinstance(statement["Action"], list)
            else [statement["Action"]]
        )
    }
    resources = {
        resource
        for statement in statements
        for resource in (
            statement["Resource"]
            if isinstance(statement["Resource"], list)
            else [statement["Resource"]]
        )
    }

    assert {
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
    } <= actions
    assert "s3:HeadObject" not in actions
    assert "s3:CopyObject" not in actions
    assert (
        "arn:aws:dynamodb:ap-southeast-2:000000000000:"
        "table/rmit-society-local/index/*"
    ) in resources
