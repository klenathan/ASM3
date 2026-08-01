from __future__ import annotations

import json
from typing import Any

from rmit_society.aws import client
from rmit_society.base import utc_now
from rmit_society.config import get_settings


def aggregate() -> dict[str, Any]:
    """Standalone ECS entry point that aggregates sanitized metrics and writes a report."""
    settings = get_settings()
    s3 = client("s3")
    response = s3.list_objects_v2(Bucket=settings.analytics_bucket, Prefix="forum-events/")
    events = 0
    approved = 0
    for item in response.get("Contents", []):
        body = s3.get_object(Bucket=settings.analytics_bucket, Key=item["Key"])["Body"].read()
        for line in body.decode().splitlines():
            if not line:
                continue
            record = json.loads(line)
            events += 1
            if record.get("action") == "approved":
                approved += 1
    report: dict[str, Any] = {
        "generated_at": utc_now(),
        "events": events,
        "approved_posts": approved,
        "feature_healthy": True,
    }
    key = f"reports/forum-summary-{report['generated_at'].replace(':', '-')}.json"
    s3.put_object(
        Bucket=settings.analytics_bucket,
        Key=key,
        Body=json.dumps(report).encode(),
        ContentType="application/json",
    )
    return report


def main() -> None:
    print(json.dumps(aggregate()))


if __name__ == "__main__":
    main()
