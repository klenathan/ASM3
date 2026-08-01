from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.config import get_settings
from rmit_society.errors import ProviderError


def run_container_analytics() -> dict[str, str]:
    settings = get_settings()
    if not settings.subnet_ids:
        raise ProviderError("ECS_SUBNET_IDS must be configured for analytics")
    network: dict[str, Any] = {"subnets": settings.subnet_ids, "assignPublicIp": "ENABLED"}
    if settings.security_group_ids:
        network["securityGroups"] = settings.security_group_ids
    response = client("ecs").run_task(
        cluster=settings.ecs_cluster,
        taskDefinition=settings.ecs_task_definition,
        launchType="FARGATE",
        count=1,
        networkConfiguration={"awsvpcConfiguration": network},
    )
    failures = response.get("failures", [])
    if failures:
        raise ProviderError(f"ECS failed to start task: {failures[0].get('reason')}")
    task = response["tasks"][0]
    return {"task_arn": task["taskArn"], "status": task["lastStatus"]}
