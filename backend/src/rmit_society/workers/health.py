"""Lambda health probe used by the infrastructure health check."""

from __future__ import annotations

import json
from typing import Any

from rmit_society.base import utc_now


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    del event, context
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"status": "ok", "service": "rmit-society", "time": utc_now()}),
    }
