from __future__ import annotations

from typing import Any

from rmit_society.base import new_id, utc_now
from rmit_society.config import get_settings
from rmit_society.domain.events import Upload
from rmit_society.errors import AuthorizationError, NotFoundError, ValidationError_
from rmit_society.providers.media import S3MediaProvider
from rmit_society.repositories.dynamodb import DynamoDBRepository

_ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class MediaService:
    def __init__(self, repo: DynamoDBRepository, media: S3MediaProvider | None = None) -> None:
        self.repo = repo
        self.media = media or S3MediaProvider()
        self.settings = get_settings()

    def request_upload(
        self, *, user_id: str, society_id: str, content_type: str, size: int
    ) -> Upload:
        extension = _ALLOWED_TYPES.get(content_type)
        if extension is None:
            raise ValidationError_("Unsupported media type")
        if size > self.settings.max_image_bytes:
            raise ValidationError_("Media exceeds maximum size")
        upload_id = new_id("up")
        upload = Upload(
            upload_id=upload_id,
            owner_user_id=user_id,
            society_id=society_id,
            institution_id="rmit",
            declared_content_type=content_type,
            declared_size=size,
            quarantine_key=S3MediaProvider.quarantine_key(upload_id),
            state="PENDING",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        self.repo.create_upload(upload)
        return upload

    def get_upload(self, *, upload_id: str, user_id: str) -> Upload:
        upload = self.repo.get_upload(upload_id)
        if upload is None:
            raise NotFoundError("Upload not found")
        if upload.owner_user_id != user_id:
            raise AuthorizationError("Not your upload")
        return upload

    def media_access(self, media_id: str, user_id: str) -> dict[str, Any]:
        del user_id
        # MVP resolves media_id to the approved prefix deterministically.
        if not media_id.startswith("m_"):
            raise NotFoundError("Media not found")
        key = f"approved/{media_id}.img"
        if not self.media.exists(key):
            raise NotFoundError("Media not found")
        return {"url": self.media.download_url(key), "media_id": media_id}

    def quarantine_url(self, upload: Upload) -> dict[str, Any]:
        return self.media.upload_url(upload.quarantine_key, upload.declared_content_type)

    @staticmethod
    def approved_key(media_id: str) -> str:
        return f"approved/{media_id}.img"
