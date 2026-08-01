import json
from collections import defaultdict
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Attr

from cloudpulse.aws import client, resource
from cloudpulse.config import get_settings
from cloudpulse.models import AnalyticsRun, QueryResult, QueryStarted, utc_now

SUMMARY_QUERY = """
SELECT
  location_name,
  round(avg(temperature_c), 1) AS avg_temperature_c,
  round(avg(european_aqi), 1) AS avg_european_aqi,
  round(avg(pm2_5), 1) AS avg_pm2_5,
  count(*) AS sample_count
FROM observations
WHERE from_iso8601_timestamp(observed_at) >= current_timestamp - interval '7' day
GROUP BY location_name
ORDER BY avg_european_aqi DESC
""".strip()


def start_summary_query() -> QueryStarted:
    settings = get_settings()
    response = client("athena").start_query_execution(
        QueryString=SUMMARY_QUERY,
        QueryExecutionContext={"Database": settings.athena_database},
        ResultConfiguration={
            "OutputLocation": f"s3://{settings.data_bucket}/athena-results/",
        },
        WorkGroup=settings.athena_workgroup,
    )
    return QueryStarted(query_execution_id=response["QueryExecutionId"])


def get_query_result(query_execution_id: str) -> QueryResult:
    athena = client("athena")
    execution = athena.get_query_execution(QueryExecutionId=query_execution_id)["QueryExecution"]
    state = execution["Status"]["State"]
    reason = execution["Status"].get("StateChangeReason")
    if state != "SUCCEEDED":
        return QueryResult(
            query_execution_id=query_execution_id,
            status=state,
            reason=reason,
        )

    result = athena.get_query_results(QueryExecutionId=query_execution_id)
    columns = [column["Name"] for column in result["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]]
    data_rows = result["ResultSet"].get("Rows", [])[1:]
    rows = []
    for row in data_rows:
        values = [cell.get("VarCharValue") for cell in row.get("Data", [])]
        values.extend([None] * (len(columns) - len(values)))
        rows.append(dict(zip(columns, values, strict=True)))
    return QueryResult(
        query_execution_id=query_execution_id,
        status=state,
        columns=columns,
        rows=rows,
    )


def run_analytics_task() -> AnalyticsRun:
    settings = get_settings()
    if not settings.subnet_ids:
        raise RuntimeError("ECS_SUBNET_IDS must be configured")
    awsvpc: dict[str, Any] = {
        "subnets": settings.subnet_ids,
        "assignPublicIp": "ENABLED",
    }
    if settings.security_group_ids:
        awsvpc["securityGroups"] = settings.security_group_ids
    response = client("ecs").run_task(
        cluster=settings.ecs_cluster,
        taskDefinition=settings.ecs_task_definition,
        launchType="FARGATE",
        count=1,
        networkConfiguration={"awsvpcConfiguration": awsvpc},
    )
    failures = response.get("failures", [])
    if failures:
        raise RuntimeError(failures[0].get("reason", "ECS failed to start task"))
    task = response["tasks"][0]
    return AnalyticsRun(task_arn=task["taskArn"], status=task["lastStatus"])


def list_reports() -> list[dict[str, Any]]:
    settings = get_settings()
    response = client("s3").list_objects_v2(
        Bucket=settings.data_bucket,
        Prefix="reports/",
    )
    reports = [
        {"key": item["Key"], "size": item["Size"], "last_modified": item["LastModified"]}
        for item in response.get("Contents", [])
        if item["Key"].endswith(".json")
    ]
    return sorted(reports, key=lambda report: report["last_modified"], reverse=True)


def build_summary_report() -> dict[str, Any]:
    settings = get_settings()
    table = resource("dynamodb").Table(settings.table_name)
    response = table.scan(FilterExpression=Attr("entity_type").eq("OBSERVATION"))
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"temperature": [], "aqi": [], "pm2_5": []}
    )
    for item in response.get("Items", []):
        values = grouped[item["location_name"]]
        for source, target in (
            ("temperature_c", "temperature"),
            ("european_aqi", "aqi"),
            ("pm2_5", "pm2_5"),
        ):
            if item.get(source) is not None:
                values[target].append(float(item[source]))

    def average(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 2) if values else None

    report = {
        "generated_at": utc_now(),
        "locations": [
            {
                "location_name": name,
                "sample_count": max((len(values) for values in metrics.values()), default=0),
                "avg_temperature_c": average(metrics["temperature"]),
                "avg_european_aqi": average(metrics["aqi"]),
                "avg_pm2_5": average(metrics["pm2_5"]),
            }
            for name, metrics in sorted(grouped.items())
        ],
    }
    key = f"reports/summary-{report['generated_at'].replace(':', '-')}.json"
    client("s3").put_object(
        Bucket=settings.data_bucket,
        Key=key,
        Body=json.dumps(report).encode(),
        ContentType="application/json",
    )
    return report
