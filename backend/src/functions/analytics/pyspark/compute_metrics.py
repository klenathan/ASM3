#!/usr/bin/env python3
"""
Compute Analytics Metrics — PySpark job for the RMIT Society analytics pipeline.

Reads JSONL dumps from S3 (analytics/staging/<timestamp>/), computes four
metric types in one pass, and writes results as JSONL to S3
(analytics/output/<timestamp>/).

Usage (submitted by start-serverless Lambda via spark-submit):
  spark-submit compute_metrics.py \
    --staging-bucket <bucket> \
    --staging-path <prefix/timestamp> \
    --output-bucket <bucket> \
    --output-path <prefix/timestamp>
"""
import argparse
import json
from datetime import datetime, timezone
from typing import Any

from pyspark.sql import SparkSession, DataFrame, functions as F, types as T


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute analytics metrics")
    parser.add_argument("--staging-bucket", required=True, help="S3 bucket for staging data")
    parser.add_argument("--staging-path", required=True, help="S3 prefix for staging data (without bucket)")
    parser.add_argument("--output-bucket", required=True, help="S3 bucket for output")
    parser.add_argument("--output-path", required=True, help="S3 prefix for output (without bucket)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    spark = SparkSession.builder.appName("RMITSocietyAnalytics").getOrCreate()
    staging_base = f"s3://{args.staging_bucket}/{args.staging_path}"
    output_base = f"s3://{args.output_bucket}/{args.output_path}"

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ── 1. Load staging data ──────────────────────────────────────────────
    users_df = spark.read.json(f"{staging_base}/users.jsonl") if _table_exists(spark, f"{staging_base}/users.jsonl") else spark.createDataFrame([], _raw_schema("users"))
    threads_df = spark.read.json(f"{staging_base}/threads.jsonl") if _table_exists(spark, f"{staging_base}/threads.jsonl") else spark.createDataFrame([], _raw_schema("threads"))
    comments_df = spark.read.json(f"{staging_base}/comments.jsonl") if _table_exists(spark, f"{staging_base}/comments.jsonl") else spark.createDataFrame([], _raw_schema("comments"))
    memberships_df = spark.read.json(f"{staging_base}/memberships.jsonl") if _table_exists(spark, f"{staging_base}/memberships.jsonl") else spark.createDataFrame([], _raw_schema("memberships"))
    votes_df = spark.read.json(f"{staging_base}/votes.jsonl") if _table_exists(spark, f"{staging_base}/votes.jsonl") else spark.createDataFrame([], _raw_schema("votes"))
    reports_df = spark.read.json(f"{staging_base}/reports.jsonl") if _table_exists(spark, f"{staging_base}/reports.jsonl") else spark.createDataFrame([], _raw_schema("reports"))

    metrics: list[tuple[str, str | None, str, str, dict[str, Any]]] = []

    # ── 2. User Growth (platform-wide, society_id = None) ────────────────
    if users_df.count() > 0:
        total = users_df.count()
        active = users_df.filter(F.col("status") == "active").count()
        suspended = users_df.filter(F.col("status") == "suspended").count()
        metrics.append((
            "user_growth", None, today, today,
            {"registrations": total, "active_users": active, "total_users": total, "suspensions": suspended},
        ))

    # ── 3. Content Volume (per-society + platform) ────────────────────────
    thread_count = threads_df.count() if threads_df.count() > 0 else 0
    comment_count = comments_df.count() if comments_df.count() > 0 else 0
    vote_count = votes_df.count() if votes_df.count() > 0 else 0
    report_count = reports_df.count() if reports_df.count() > 0 else 0

    metrics.append((
        "content_volume", None, today, today,
        {"threads": thread_count, "comments": comment_count, "votes": vote_count, "reports": report_count},
    ))

    # Per-society content volume
    if threads_df.count() > 0 and "society_id" in threads_df.columns:
        society_threads = threads_df.groupBy("society_id").agg(F.count("*").alias("threads"))
        if comments_df.count() > 0 and "society_id" in comments_df.columns:
            society_comments = comments_df.groupBy("society_id").agg(F.count("*").alias("comments"))
            society_threads = society_threads.join(society_comments, "society_id", "left")
        for row in society_threads.collect():
            sid = row["society_id"]
            metrics.append((
                "content_volume", sid, today, today,
                {"threads": row.get("threads", 0), "comments": row.get("comments", 0), "votes": 0, "reports": 0},
            ))

    # ── 4. Top Societies (platform-wide) ──────────────────────────────────
    if memberships_df.count() > 0:
        top_by_members = (
            memberships_df.filter(F.col("status") == "active")
            .groupBy("society_id")
            .agg(F.count("*").alias("member_count"))
            .orderBy(F.desc("member_count"))
            .limit(10)
        )

        # Get society names if available
        if "name" in memberships_df.columns:
            top_entries = [
                {"society_id": row["society_id"], "name": row.get("name", ""), "member_count": row["member_count"], "thread_count": 0}
                for row in top_by_members.collect()
            ]
        else:
            top_entries = [
                {"society_id": row["society_id"], "name": "", "member_count": row["member_count"], "thread_count": 0}
                for row in top_by_members.collect()
            ]

        top_by_threads = (
            threads_df.groupBy("society_id")
            .agg(F.count("*").alias("thread_count"))
            .orderBy(F.desc("thread_count"))
            .limit(10)
        ) if threads_df.count() > 0 and "society_id" in threads_df.columns else spark.createDataFrame([], T.StructType())

        thread_entries = [
            {"society_id": row["society_id"], "name": "", "member_count": 0, "thread_count": row["thread_count"]}
            for row in top_by_threads.collect()
        ] if top_by_threads.count() > 0 else []

        metrics.append((
            "top_societies", None, today, today,
            {"top_by_members": top_entries, "top_by_threads": thread_entries},
        ))

    # ── 5. Moderation Metrics (platform-wide + per-society) ──────────────
    if reports_df.count() > 0:
        pending = reports_df.filter(F.col("status") == "pending").count()
        resolved_today = reports_df.filter(
            (F.col("status") == "resolved") & (F.col("resolved_at") >= today)
        ).count() if "resolved_at" in reports_df.columns else 0
        total = reports_df.count()

        metrics.append((
            "moderation", None, today, today,
            {"pending_reports": pending, "resolved_today": resolved_today, "avg_resolution_hours": 0.0, "total_reports": total},
        ))

        # Per-society moderation
        if "society_id" in reports_df.columns:
            society_reports = reports_df.groupBy("society_id").agg(
                F.sum(F.when(F.col("status") == "pending", 1).otherwise(0)).alias("pending_reports"),
                F.count("*").alias("total_reports"),
            )
            for row in society_reports.collect():
                sid = row["society_id"]
                metrics.append((
                    "moderation", sid, today, today,
                    {"pending_reports": row["pending_reports"], "resolved_today": 0, "avg_resolution_hours": 0.0, "total_reports": row["total_reports"]},
                ))

    # ── 6. Write output ──────────────────────────────────────────────────
    output_rows = [
        {
            "metric_type": m[0],
            "society_id": m[1],
            "period_start": f"{m[2]}T00:00:00.000Z",
            "period_end": f"{m[3]}T23:59:59.999Z",
            "data": m[4],
        }
        for m in metrics
    ]

    output_df = spark.createDataFrame(output_rows)
    output_df.coalesce(1).write.mode("overwrite").json(f"{output_base}/metrics.jsonl")

    print(f"Computed {len(metrics)} metric rows, written to {output_base}/metrics.jsonl/")
    spark.stop()


def _table_exists(spark: SparkSession, path: str) -> bool:
    try:
        spark.read.json(path).schema  # Try to read schema
        return True
    except Exception:
        return False


def _raw_schema(table: str) -> T.StructType:
    """Return a minimal schema for tables that may not exist."""
    return T.StructType([
        T.StructField("id", T.StringType(), True),
        T.StructField("society_id", T.StringType(), True),
    ])


if __name__ == "__main__":
    main()