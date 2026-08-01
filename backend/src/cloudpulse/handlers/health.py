import json
from typing import Any

from cloudpulse.models import utc_now


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    del event, context
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"status": "ok", "service": "cloudpulse", "time": utc_now()}),
    }
