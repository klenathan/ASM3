from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.config import get_settings
from rmit_society.errors import ProviderError


def start_forum_query() -> dict[str, str]:
    settings = get_settings()
    query = """
    SELECT date, count(*) AS event_count,
           count_if(json_extract_scalar(event, '$.action') = 'post.approved') AS approved_posts
    FROM forum_events
    WHERE date >= date_format(current_date - interval '7' day, '%Y-%m-%d')
    GROUP BY date
    ORDER BY date DESC
    """.strip()
    response = client("athena").start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": settings.athena_database},
        ResultConfiguration={"OutputLocation": f"s3://{settings.analytics_bucket}/athena-results/"},
        WorkGroup=settings.athena_workgroup,
    )
    return {"query_execution_id": response["QueryExecutionId"], "status": "QUEUED"}


def get_query_result(query_execution_id: str) -> dict[str, Any]:
    athena = client("athena")
    execution = athena.get_query_execution(QueryExecutionId=query_execution_id)["QueryExecution"]
    state = execution["Status"]["State"]
    reason = execution["Status"].get("StateChangeReason")
    if state != "SUCCEEDED":
        return {
            "query_execution_id": query_execution_id,
            "status": state,
            "rows": [],
            "reason": reason,
        }
    result = athena.get_query_results(QueryExecutionId=query_execution_id)
    columns = [column["Name"] for column in result["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]]
    rows: list[dict[str, str | None]] = []
    for row in result["ResultSet"].get("Rows", [])[1:]:
        values = [cell.get("VarCharValue") for cell in row.get("Data", [])]
        values.extend([None] * (len(columns) - len(values)))
        rows.append(dict(zip(columns, values, strict=True)))
    return {
        "query_execution_id": query_execution_id,
        "status": state,
        "columns": columns,
        "rows": rows,
    }


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
