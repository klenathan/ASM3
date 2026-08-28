#!/usr/bin/env python3
"""Materialize the analytics source snapshot from PostgreSQL as Parquet.

The job writes each source table beneath a stable catalog location and adds
the run identity as partition values. Athena can therefore retain historical
snapshots while its contract queries consistently select the newest one.
"""
import sys
from datetime import datetime, timezone

import boto3

from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.job import Job
from pyspark.context import SparkContext
from pyspark.sql import functions as F


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
    if len(snapshot_at) != 16 or not snapshot_at.endswith("Z") or snapshot_at[8] != "T":
        raise ValueError("snapshot-at must be a UTC partition timestamp")
    cleanup_run_output(bucket, run_id, snapshot_at)
    jdbc = context.extract_jdbc_conf(connection_name)
    jdbc_url = jdbc.get("fullUrl") or jdbc.get("url")
    if not jdbc_url:
        raise ValueError("Glue JDBC connection did not provide a URL")

    queries = {
        "users": """
          SELECT u.id::text AS id, u.created_at, p.status
          FROM auth_users u INNER JOIN user_profiles p ON p.user_id = u.id
        """,
        "societies": "SELECT id::text AS id, name, slug, status, created_at FROM societies",
        "threads": "SELECT id::text AS id, society_id::text AS society_id, author_id::text AS author_id, status, created_at FROM threads",
        "comments": """
          SELECT c.id::text AS id, c.thread_id::text AS thread_id, c.author_id::text AS author_id,
                 c.status, c.created_at, t.society_id::text AS society_id
          FROM comments c INNER JOIN threads t ON t.id = c.thread_id
        """,
        "memberships": "SELECT society_id::text AS society_id, user_id::text AS user_id, role, status, joined_at FROM society_memberships",
        "votes": """
           SELECT v.thread_id::text AS target_id, v.user_id::text AS user_id, v.value, v.created_at, t.society_id::text AS society_id
           FROM thread_votes v INNER JOIN threads t ON t.id = v.thread_id
           UNION ALL
           SELECT v.comment_id::text AS target_id, v.user_id::text AS user_id, v.value, v.created_at, t.society_id::text AS society_id
           FROM comment_votes v
           INNER JOIN comments c ON c.id = v.comment_id
           INNER JOIN threads t ON t.id = c.thread_id
        """,
        "reports": """
          SELECT id::text AS id, society_id::text AS society_id, status, created_at, resolved_at FROM reports
        """,
    }

    jdbc_options = {
        "url": jdbc_url,
        "user": jdbc["user"],
        "password": jdbc["password"],
        "driver": "org.postgresql.Driver",
    }
    for table, query in queries.items():
        frame = context.spark_session.read.format("jdbc").options(**jdbc_options).option("query", query).load()
        frame = frame.withColumn("snapshot_at", F.lit(snapshot_at))
        frame = frame.withColumn("snapshot_id", F.lit(run_id))
        dynamic = DynamicFrame.fromDF(frame, context, table)
        sink = context.getSink(
            connection_type="s3",
            path=f"s3://{bucket}/analytics/source/table={table}/",
            enableUpdateCatalog=True,
            updateBehavior="UPDATE_IN_DATABASE",
            partitionKeys=["snapshot_at", "snapshot_id"],
        )
        sink.setCatalogInfo(catalogDatabase=database, catalogTableName=table)
        sink.setFormat("glueparquet")
        sink.writeFrame(dynamic)

    manifest = context.spark_session.createDataFrame(
        [(snapshot_at, run_id, datetime.now(timezone.utc))],
        ["snapshot_at", "snapshot_id", "completed_at"],
    )
    manifest.write.mode("overwrite").parquet(
        f"s3://{bucket}/analytics/manifest/snapshot_id={run_id}/",
    )

    job.commit()


def cleanup_run_output(bucket: str, run_id: str, snapshot_at: str) -> None:
    """Make a retry overwrite the run's exact source and manifest prefixes."""
    client = boto3.client("s3")
    prefixes = [
        f"analytics/source/table={table}/snapshot_at={snapshot_at}/snapshot_id={run_id}/"
        for table in ("users", "societies", "threads", "comments", "memberships", "votes", "reports")
    ]
    prefixes.append(f"analytics/manifest/snapshot_id={run_id}/")
    for prefix in prefixes:
        response = client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        while True:
            objects = [{"Key": item["Key"]} for item in response.get("Contents", [])]
            if objects:
                deleted = client.delete_objects(Bucket=bucket, Delete={"Objects": objects})
                if deleted.get("Errors"):
                    raise RuntimeError(f"could not clean previous analytics output: {deleted['Errors']}")
            token = response.get("NextContinuationToken")
            if token is None:
                break
            response = client.list_objects_v2(Bucket=bucket, Prefix=prefix, ContinuationToken=token)


if __name__ == "__main__":
    main()
