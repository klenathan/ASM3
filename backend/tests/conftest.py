from __future__ import annotations

import os
from collections.abc import Iterator

import boto3
import pytest
from moto import mock_aws

from rmit_society.config import get_settings

REGION = "ap-southeast-2"
TABLE = "rmit-society-local"
MEDIA_BUCKET = "rmit-society-local-media"
ANALYTICS_BUCKET = "rmit-society-local-analytics"

_PK_SK_ATTRS = [
    {"AttributeName": "PK", "AttributeType": "S"},
    {"AttributeName": "SK", "AttributeType": "S"},
]

_GSIS = [
    {
        "IndexName": "gsi_handle",
        "KeySchema": [
            {"AttributeName": "gsi_handle_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_handle_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_slug",
        "KeySchema": [
            {"AttributeName": "gsi_slug_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_slug_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_content",
        "KeySchema": [
            {"AttributeName": "gsi_content_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_content_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_user_society",
        "KeySchema": [
            {"AttributeName": "gsi_user_society_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_user_society_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_modqueue",
        "KeySchema": [
            {"AttributeName": "gsi_mod_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_mod_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_report",
        "KeySchema": [
            {"AttributeName": "gsi_report_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_report_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_appeal",
        "KeySchema": [
            {"AttributeName": "gsi_appeal_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_appeal_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
    {
        "IndexName": "gsi_society_pin",
        "KeySchema": [
            {"AttributeName": "gsi_society_pin_pk", "KeyType": "HASH"},
            {"AttributeName": "gsi_society_pin_sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    },
]


def _create_resources() -> None:
    os.environ["AWS_DEFAULT_REGION"] = REGION
    os.environ["AWS_REGION"] = REGION
    os.environ.pop("AWS_ENDPOINT_URL", None)
    dyn = boto3.client("dynamodb", region_name=REGION)
    dyn.create_table(
        TableName=TABLE,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=_PK_SK_ATTRS
        + [
            {"AttributeName": "gsi_handle_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_handle_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_slug_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_slug_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_content_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_content_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_user_society_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_user_society_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_mod_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_mod_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_report_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_report_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_appeal_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_appeal_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_society_pin_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_society_pin_sk", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=_GSIS,
        BillingMode="PAY_PER_REQUEST",
    )
    s3 = boto3.client("s3", region_name=REGION)
    for bucket in (MEDIA_BUCKET, ANALYTICS_BUCKET):
        s3.create_bucket(
            Bucket=bucket,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )


@pytest.fixture
def aws_resources() -> Iterator[None]:
    with mock_aws():
        _create_resources()
        yield


@pytest.fixture(autouse=True)
def test_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("TABLE_NAME", TABLE)
    monkeypatch.setenv("MEDIA_BUCKET", MEDIA_BUCKET)
    monkeypatch.setenv("ANALYTICS_BUCKET", ANALYTICS_BUCKET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
