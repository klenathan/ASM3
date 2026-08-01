from __future__ import annotations

from typing import Any

from rmit_society.base import utc_now
from rmit_society.config import get_settings
from rmit_society.domain.enums import ModerationDecision
from rmit_society.errors import ProviderError
from rmit_society.providers.local_moderation import LocalTextModerator
from rmit_society.providers.media import S3ObjectStore
from rmit_society.providers.rekognition import RekognitionImageModerator
from rmit_society.repositories.dynamodb import DynamoDBRepository


def process_upload(event: dict[str, Any]) -> None:
    settings = get_settings()
    repo = DynamoDBRepository()
    store = S3ObjectStore()

    detail = event.get("detail", event)
    upload_id = str(detail.get("upload_id", ""))
    upload = repo.get_upload(upload_id)
    if upload is None or upload.state != "PENDING":
        return

    try:
        store.head(settings.media_bucket, upload.quarantine_key)
    except ProviderError:
        return

    provider = build_image_moderator()
    try:
        outcome = provider.moderate_image(bucket=settings.media_bucket, key=upload.quarantine_key)
    except ProviderError:
        raise

    if outcome.decision == ModerationDecision.REJECT:
        repo.update_upload(upload_id, state="REJECTED", updated_at=utc_now())
        return

    media_id = f"m_{upload_id.removeprefix('up_')}"
    target_key = f"approved/{media_id}.img"
    store.copy(settings.media_bucket, upload.quarantine_key, settings.media_bucket, target_key)
    repo.update_upload(upload_id, state="APPROVED", media_id=media_id, updated_at=utc_now())


def build_image_moderator() -> Any:
    settings = get_settings()
    if settings.image_provider == "aws":
        return RekognitionImageModerator(
            bucket=settings.media_bucket, policy_version=settings.policy_version
        )
    # Local deterministic stub for images: validates via S3 presence and approves.
    return LocalImageModerator(policy_version=settings.policy_version)


class LocalImageModerator:
    provider_name = "local-image"
    model_version = "local-v1"

    def __init__(self, policy_version: str = "1") -> None:
        self.policy_version = policy_version

    def moderate_image(self, *, bucket: str, key: str) -> Any:
        return LocalTextModerator(self.policy_version).moderate_text("", content_id=key)
