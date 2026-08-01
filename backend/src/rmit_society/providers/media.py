from __future__ import annotations

import json
from typing import Any, cast

from rmit_society.aws import client
from rmit_society.base import utc_now
from rmit_society.config import get_settings
from rmit_society.errors import ProviderError


class S3MediaProvider:
    """Presigned uploads and controlled delivery for the private media bucket."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: Any = client("s3")

    @property
    def bucket(self) -> str:
        return self._settings.media_bucket

    def upload_url(
        self, key: str, content_type: str, *, expiry_s: int | None = None
    ) -> dict[str, Any]:
        expiry = expiry_s or self._settings.presigned_expiry_s
        try:
            url = self._client.generate_presigned_url(
                "put_object",
                Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
                ExpiresIn=expiry,
            )
        except Exception as error:
            raise ProviderError(f"Failed to create upload URL: {error}") from error
        return {
            "url": url,
            "headers": {"content-type": content_type},
            "expires_in": expiry,
            "bucket": self.bucket,
            "key": key,
        }

    def download_url(self, key: str, *, expiry_s: int | None = None) -> str:
        expiry = expiry_s or self._settings.presigned_expiry_s
        try:
            return cast(
                str,
                self._client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self.bucket, "Key": key},
                    ExpiresIn=expiry,
                ),
            )
        except Exception as error:
            raise ProviderError(f"Failed to create media URL: {error}") from error

    @staticmethod
    def quarantine_key(upload_id: str) -> str:
        return f"quarantine/{upload_id}"

    @staticmethod
    def approved_key(media_id: str, extension: str) -> str:
        return f"approved/{media_id}{extension}"

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


class S3ObjectStore:
    """Thin wrappers over S3 object operations used by workers."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: Any = client("s3")

    def copy(
        self, source_bucket: str, source_key: str, target_bucket: str, target_key: str
    ) -> None:
        try:
            self._client.copy_object(
                Bucket=target_bucket,
                Key=target_key,
                CopySource={"Bucket": source_bucket, "Key": source_key},
            )
        except Exception as error:
            raise ProviderError(f"Failed to finalize media: {error}") from error

    def head(self, bucket: str, key: str) -> dict[str, Any]:
        try:
            return cast(dict[str, Any], self._client.head_object(Bucket=bucket, Key=key))
        except Exception as error:
            raise ProviderError(f"Media not found: {error}") from error

    def exists(self, bucket: str, key: str) -> bool:
        try:
            self.head(bucket, key)
            return True
        except ProviderError:
            return False


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
