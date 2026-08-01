from typing import Any

import boto3

from cloudpulse.config import get_settings


def client(service: str) -> Any:
    settings = get_settings()
    return boto3.client(
        service,
        region_name=settings.aws_region,
        endpoint_url=settings.aws_endpoint_url,
    )


def resource(service: str) -> Any:
    settings = get_settings()
    return boto3.resource(
        service,
        region_name=settings.aws_region,
        endpoint_url=settings.aws_endpoint_url,
    )
