from typing import Any

import boto3

from rmit_society.config import get_settings


def client(service: str) -> Any:
    settings = get_settings()
    return boto3.client(service, region_name=settings.aws_region)


def resource(service: str) -> Any:
    settings = get_settings()
    return boto3.resource(service, region_name=settings.aws_region)
