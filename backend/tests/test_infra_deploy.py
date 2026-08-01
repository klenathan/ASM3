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
    return infrastructure


def test_app_environment_is_aws_only() -> None:
    environment = _infrastructure().app_environment(
        {"subnets": ["subnet-1"], "security_groups": ["sg-1"]},
        {"moderation": "moderation-url", "image": "image-url", "events": "events-url"},
    )

    values = {item["name"]: item["value"] for item in environment}
    assert "AWS_ENDPOINT_URL" not in values
    assert values["ENVIRONMENT"] == "dev"
    assert values["MODERATION_PROVIDER"] == "aws"
    assert values["IMAGE_PROVIDER"] == "aws"


def test_names_make_s3_buckets_globally_unique() -> None:
    names = Names(stage="prod", account_id="123456789012")

    assert names.media_bucket == "rmit-society-prod-123456789012-media"
    assert names.web_bucket == "rmit-society-prod-123456789012-web"


def test_deployment_rejects_latest_or_wrong_repository() -> None:
    infrastructure = _infrastructure()
    repository = "000000000000.dkr.ecr.ap-southeast-2.amazonaws.com/rmit-society-dev-backend"

    infrastructure._validate_image("backend", f"{repository}:release-abc", repository)
    with pytest.raises(ValueError, match="immutable"):
        infrastructure._validate_image("backend", f"{repository}:latest", repository)
    with pytest.raises(ValueError, match="provisioned repository"):
        infrastructure._validate_image(
            "backend",
            "000000000000.dkr.ecr.ap-southeast-2.amazonaws.com/other:release-abc",
            repository,
        )


def test_ec2_role_can_pull_backend_image_and_query_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    infrastructure = _infrastructure()
    policies: dict[str, dict[str, Any]] = {}

    def capture_role(
        name: str,
        principals: list[str],
        policy: dict[str, Any],
    ) -> str:
        del principals
        policies[name] = policy
        return f"arn:aws:iam::000000000000:role/{name}"

    class Waiter:
        def wait(self, **kwargs: object) -> None:
            del kwargs

    class IamClient:
        def get_waiter(self, name: str) -> Waiter:
            assert name == "role_exists"
            return Waiter()

    infrastructure.ensure_role = capture_role  # type: ignore[method-assign]
    infrastructure.aws = lambda service: IamClient()  # type: ignore[method-assign]
    monkeypatch.setattr("iac.iam.time.sleep", lambda _: None)
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
        "table/rmit-society-dev/index/*"
    ) in resources
