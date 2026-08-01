from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    require_active_user,
    resolve_current_user,
)
from rmit_society.domain.events import Upload
from rmit_society.errors import NotFoundError
from rmit_society.repositories.factory import get_repository
from rmit_society.services import societies as societies_service
from rmit_society.services.media import MediaService

repo = get_repository()
media = MediaService(repo)
router = APIRouter(tags=["media"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]


@router.post("/uploads")
async def request_upload(
    user: ActiveUser, content_type: str, size: int, slug: str
) -> dict[str, Any]:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    upload = await run_in_threadpool(
        media.request_upload,
        user_id=user.user_id,
        society_id=society.society_id,
        content_type=content_type,
        size=size,
    )
    put = await run_in_threadpool(media.quarantine_url, upload)
    return {"upload_id": upload.upload_id, "put": put, "upload": upload.model_dump()}


@router.get("/uploads/{upload_id}", response_model=Upload)
async def get_upload(user: ActiveUser, upload_id: str) -> Upload:
    try:
        return await run_in_threadpool(media.get_upload, upload_id=upload_id, user_id=user.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@router.get("/media/{media_id}/access")
async def media_access(user: ActiveUser, media_id: str) -> dict[str, Any]:
    try:
        return await run_in_threadpool(media.media_access, media_id, user.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


app = create_api("RMIT Society media")
app.include_router(router)
handler = Mangum(app, lifespan="off")
