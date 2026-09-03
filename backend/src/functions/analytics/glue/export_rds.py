#!/usr/bin/env python3
"""Materialize the analytics source snapshot from PostgreSQL as Parquet.

The job writes each source table beneath a stable catalog location and adds
the run identity as partition values. Athena can therefore retain historical
snapshots while its contract queries consistently select the newest one.

Action events are exported for the requested UTC occurrence-date range with
event-date, snapshot-at, and snapshot-id partitions. Only pseudonymized actor
fields are selected: direct user identifiers never leave PostgreSQL.
"""
import logging
import re
from datetime import datetime, timezone
import sys

import boto3

from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.job import Job
from pyspark.context import SparkContext
from pyspark.sql import functions as F

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
LOGGER = logging.getLogger(__name__)


def argument(name: str, default: str | None = None) -> str:
    flag = f"--{name}"
    for index, value in enumerate(sys.argv):
        if value == flag and index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    if default is not None:
        return default
    raise ValueError(f"missing Glue argument: {flag}")


def main() -> None:
    context = GlueContext(SparkContext.getOrCreate())
    job = Job(context)
    job.init(argument("JOB_NAME"), {})

    bucket = argument("analytics-bucket")
    database = argument("catalog-database")
    connection_name = argument("connection-name")
    run_id = argument("refresh-run-id")
    snapshot_at = argument("snapshot-at")
    period_start = argument("period-start")
    period_end = argument("period-end")
    if len(snapshot_at) != 16 or not snapshot_at.endswith("Z") or snapshot_at[8] != "T":
        raise ValueError("snapshot-at must be a UTC partition timestamp")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_start) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}", period_end
    ):
        raise ValueError("period-start and period-end must be UTC calendar dates")
    if period_start >= period_end:
        raise ValueError("period-start must be before period-end")
    LOGGER.info(
        "Starting analytics snapshot run_id=%s snapshot_at=%s period=[%s,%s)",
        run_id,
        snapshot_at,
        period_start,
        period_end,
    )
    cleanup_run_output(bucket, run_id, snapshot_at)
    jdbc = context.extract_jdbc_conf(connection_name)
    jdbc_url = jdbc.get("fullUrl") or jdbc.get("url")
    if not jdbc_url:
        raise ValueError("Glue JDBC connection did not provide a URL")

    queries = {
        "users": """
          SELECT u.created_at, p.status
          FROM auth_users u INNER JOIN user_profiles p ON p.user_id = u.id
        """,
        "societies": "SELECT id::text AS id, name, slug, status, created_at FROM societies",
        "threads": "SELECT id::text AS id, society_id::text AS society_id, status, created_at FROM threads",
        "comments": """
          SELECT c.id::text AS id, c.thread_id::text AS thread_id,
                 c.status, c.created_at, t.society_id::text AS society_id
          FROM comments c INNER JOIN threads t ON t.id = c.thread_id
        """,
        "memberships": """
          SELECT society_id::text AS society_id, role, status, count(*) AS member_count
          FROM society_memberships
          GROUP BY society_id, role, status
        """,
        "votes": """
          SELECT vote_rows.target_id, vote_rows.value, vote_rows.society_id,
                 count(*) AS vote_count
          FROM (
            SELECT v.thread_id::text AS target_id, v.value,
                   t.society_id::text AS society_id
            FROM thread_votes v INNER JOIN threads t ON t.id = v.thread_id
            UNION ALL
            SELECT v.comment_id::text AS target_id, v.value,
                   t.society_id::text AS society_id
            FROM comment_votes v
            INNER JOIN comments c ON c.id = v.comment_id
            INNER JOIN threads t ON t.id = c.thread_id
          ) vote_rows
          GROUP BY vote_rows.target_id, vote_rows.value, vote_rows.society_id
        """,
        "reports": """
          SELECT id::text AS id, society_id::text AS society_id, status,
                 created_at, resolved_at
          FROM reports
        """,
        "action_events": f"""
          SELECT e.event_id::text AS event_id, e.event_type, e.schema_version,
                 e.actor_pseudonym, e.pseudonym_key_version,
                 e.actor_platform_role, e.actor_society_role,
                 e.occurred_at, e.ingested_at, e.target_type,
                 e.target_id::text AS target_id, e.society_id::text AS society_id,
                 e.thread_id::text AS thread_id, e.comment_id::text AS comment_id,
                 e.report_id::text AS report_id, e.correlation_id,
                 e.from_reaction, e.to_reaction, e.metadata::text AS metadata,
                 (e.occurred_at AT TIME ZONE 'UTC')::date AS event_date
          FROM action_events e
          WHERE e.occurred_at >=
            (CAST('{period_start}' AS timestamp) AT TIME ZONE 'UTC')
            AND e.occurred_at <
            (CAST('{period_end}' AS timestamp) AT TIME ZONE 'UTC')
        """,
    }

    jdbc_options = {
        "url": jdbc_url,
        "user": jdbc["user"],
        "password": jdbc["password"],
        "driver": "org.postgresql.Driver",
    }
    table_partition_keys = {
        table: ["snapshot_at", "snapshot_id"] for table in queries
    }
    table_partition_keys["action_events"] = [
        "event_date",
        "snapshot_at",
        "snapshot_id",
    ]
    for table, query in queries.items():
        LOGGER.info("Reading table=%s from PostgreSQL through JDBC", table)
        try:
            frame = (
                context.spark_session.read.format("jdbc")
                .options(**jdbc_options)
                .option("query", query)
                .load()
            )
        except Exception:
            LOGGER.exception("JDBC read failed for table=%s", table)
            raise
        frame = frame.withColumn("snapshot_at", F.lit(snapshot_at))
        frame = frame.withColumn("snapshot_id", F.lit(run_id))
        dynamic = DynamicFrame.fromDF(frame, context, table)
        sink = context.getSink(
            connection_type="s3",
            path=f"s3://{bucket}/analytics/source/table={table}/",
            enableUpdateCatalog=True,
            updateBehavior="UPDATE_IN_DATABASE",
            partitionKeys=table_partition_keys[table],
        )
        sink.setCatalogInfo(catalogDatabase=database, catalogTableName=table)
        sink.setFormat("glueparquet")
        LOGGER.info("Writing table=%s to Parquet", table)
        sink.writeFrame(dynamic)

    LOGGER.info("Writing snapshot manifest")
    manifest = context.spark_session.createDataFrame(
        [(snapshot_at, run_id, datetime.now(timezone.utc))],
        ["snapshot_at", "snapshot_id", "completed_at"],
    )
    manifest.write.mode("overwrite").parquet(
        f"s3://{bucket}/analytics/manifest/snapshot_id={run_id}/",
    )

    job.commit()
    LOGGER.info("Analytics snapshot completed run_id=%s", run_id)


def cleanup_run_output(bucket: str, run_id: str, snapshot_at: str) -> None:
    """Make a retry overwrite the run's exact source and manifest prefixes."""
    client = boto3.client("s3")
    prefixes = [
        f"analytics/source/table={table}/snapshot_at={snapshot_at}/snapshot_id={run_id}/"
        for table in (
            "users",
            "societies",
            "threads",
            "comments",
            "memberships",
            "votes",
            "reports",
        )
    ]
    action_events_prefix = "analytics/source/table=action_events/"
    prefixes.append(action_events_prefix)
    prefixes.append(f"analytics/manifest/snapshot_id={run_id}/")
    run_partition = f"/snapshot_at={snapshot_at}/snapshot_id={run_id}/"
    for prefix in prefixes:
        response = client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        while True:
            objects = [
                {"Key": item["Key"]}
                for item in response.get("Contents", [])
                if prefix != action_events_prefix or run_partition in item["Key"]
            ]
            if objects:
                LOGGER.info("Deleting stale output objects=%s prefix=%s", len(objects), prefix)
                deleted = client.delete_objects(Bucket=bucket, Delete={"Objects": objects})
                if deleted.get("Errors"):
                    raise RuntimeError(f"could not clean previous analytics output: {deleted['Errors']}")
            token = response.get("NextContinuationToken")
            if token is None:
                break
            response = client.list_objects_v2(Bucket=bucket, Prefix=prefix, ContinuationToken=token)


if __name__ == "__main__":
    main()
