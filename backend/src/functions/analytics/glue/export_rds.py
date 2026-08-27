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
from psycopg2 import connect
from psycopg2.extras import RealDictCursor


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
          SELECT u.id, u.created_at, p.status
          FROM auth_users u INNER JOIN user_profiles p ON p.user_id = u.id
        """,
        "societies": "SELECT id, name, slug, status, created_at FROM societies",
        "threads": "SELECT id, society_id, author_id, status, created_at FROM threads",
        "comments": """
          SELECT c.id, c.thread_id, c.author_id, c.status, c.created_at, t.society_id
          FROM comments c INNER JOIN threads t ON t.id = c.thread_id
        """,
        "memberships": "SELECT society_id, user_id, role, status, joined_at FROM society_memberships",
        "votes": """
           SELECT v.thread_id AS target_id, v.user_id, v.value, v.created_at, t.society_id
           FROM thread_votes v INNER JOIN threads t ON t.id = v.thread_id
           UNION ALL
           SELECT v.comment_id AS target_id, v.user_id, v.value, v.created_at, t.society_id
           FROM comment_votes v
           INNER JOIN comments c ON c.id = v.comment_id
           INNER JOIN threads t ON t.id = c.thread_id
        """,
        "reports": """
          SELECT id, society_id, status, created_at, resolved_at FROM reports
        """,
    }

    # Read every table from one repeatable-read transaction. This prevents a
    # refresh from joining rows from different database commit points.
    database_connection = connect(
        jdbc_url.removeprefix("jdbc:"),
        user=jdbc["user"],
        password=jdbc["password"],
    )
    database_connection.set_session(isolation_level="REPEATABLE READ", readonly=True)
    table_rows = {}
    try:
        with database_connection.cursor(cursor_factory=RealDictCursor) as cursor:
            for table, query in queries.items():
                cursor.execute(query)
                table_rows[table] = [
                    {
                        key: str(value) if value.__class__.__name__ == "UUID" else value
                        for key, value in row.items()
                    }
                    for row in cursor.fetchall()
                ]
        database_connection.commit()
    finally:
        database_connection.close()

    for table in queries:
        frame = context.spark_session.createDataFrame(table_rows[table], schema_for(table))
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


def schema_for(table: str):
    from pyspark.sql import types as T

    string = T.StringType()
    timestamp = T.TimestampType()
    schemas = {
        "users": [("id", string), ("created_at", timestamp), ("status", string)],
        "societies": [("id", string), ("name", string), ("slug", string), ("status", string), ("created_at", timestamp)],
        "threads": [("id", string), ("society_id", string), ("author_id", string), ("status", string), ("created_at", timestamp)],
        "comments": [("id", string), ("thread_id", string), ("author_id", string), ("status", string), ("created_at", timestamp), ("society_id", string)],
        "memberships": [("society_id", string), ("user_id", string), ("role", string), ("status", string), ("joined_at", timestamp)],
         "votes": [("target_id", string), ("user_id", string), ("value", T.LongType()), ("created_at", timestamp), ("society_id", string)],
        "reports": [("id", string), ("society_id", string), ("status", string), ("created_at", timestamp), ("resolved_at", timestamp)],
    }
    return T.StructType([T.StructField(name, data_type, True) for name, data_type in schemas[table]])


if __name__ == "__main__":
    main()
