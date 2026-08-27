#!/usr/bin/env python3
"""Materialize the analytics source snapshot from PostgreSQL as Parquet.

The job writes each source table beneath a stable catalog location and adds
the run identity as partition values. Athena can therefore retain historical
snapshots while its contract queries consistently select the newest one.
"""
import sys
from datetime import datetime, timezone

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
    snapshot_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
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
          SELECT thread_id AS target_id, user_id, value, created_at FROM thread_votes
          UNION ALL
          SELECT comment_id AS target_id, user_id, value, created_at FROM comment_votes
        """,
        "reports": """
          SELECT id, society_id, status, created_at, resolved_at FROM reports
        """,
    }

    for table, query in queries.items():
        frame = context.spark_session.read.format("jdbc").options(
            url=jdbc_url,
            user=jdbc["user"],
            password=jdbc["password"],
            driver="org.postgresql.Driver",
            dbtable=f"({query}) AS analytics_source",
        ).load()
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

    job.commit()


if __name__ == "__main__":
    main()
