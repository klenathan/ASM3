"""Analytics bounded context: sanitized event export to the analytics store."""

from __future__ import annotations

import json
from typing import Any

from rmit_society.aws import client
from rmit_society.base import utc_now
from rmit_society.config import get_settings

__all__ = ["AnalyticsProvider"]


class AnalyticsProvider:
    """Sanitized event export to the analytics bucket."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._s3: Any = client("s3")

    def write_analytics_partition(self, date: str, records: list[dict[str, Any]]) -> None:
        key = f"forum-events/date={date}/events-{utc_now().replace(':', '-')}.jsonl"
        body = "".join(json.dumps(record) + "\n" for record in records)
        self._s3.put_object(
            Bucket=self._settings.analytics_bucket,
            Key=key,
            Body=body.encode(),
            ContentType="application/x-ndjson",
        )
