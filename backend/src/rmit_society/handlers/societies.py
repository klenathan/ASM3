from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    require_active_user,
    require_admin,
    resolve_current_user,
)
from rmit_society.domain.societies import (
    Society,
    SocietyCreate,
    SocietyMembership,
    SocietyUpdate,
)
from rmit_society.errors import NotFoundError
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import societies as societies_service

repo = DynamoDBRepository()
router = APIRouter(tags=["societies"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]
AdminUser = Annotated[AuthenticatedUser, Depends(require_admin)]


@router.get("/societies", response_model=list[Society])
async def list_societies() -> list[Society]:
    return await run_in_threadpool(societies_service.list_societies, repo)


@router.post("/societies", response_model=Society, status_code=status.HTTP_201_CREATED)
async def create_society(admin: AdminUser, payload: SocietyCreate) -> Society:
    return await run_in_threadpool(
        societies_service.create_society, repo, actor_user_id=admin.user_id, payload=payload
    )


@router.get("/r/{slug}", response_model=Society)
async def society(slug: str) -> Society:
    try:
        return await run_in_threadpool(societies_service.get_society, repo, slug)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@router.patch("/r/{slug}", response_model=Society)
async def update_society(user: ActiveUser, slug: str, payload: SocietyUpdate) -> Society:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    return await run_in_threadpool(
        societies_service.update_society,
        repo,
        society=society,
        actor_user_id=user.user_id,
        payload=payload,
    )


@router.post("/r/{slug}/join", status_code=status.HTTP_204_NO_CONTENT)
async def join(user: ActiveUser, slug: str) -> None:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    await run_in_threadpool(
        societies_service.join_society, repo, society_id=society.society_id, user_id=user.user_id
    )


@router.delete("/r/{slug}/join", status_code=status.HTTP_204_NO_CONTENT)
async def leave(user: ActiveUser, slug: str) -> None:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    await run_in_threadpool(
        societies_service.leave_society, repo, society_id=society.society_id, user_id=user.user_id
    )


@router.get("/r/{slug}/members", response_model=list[SocietyMembership])
async def members(user: CurrentUser, slug: str) -> list[SocietyMembership]:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    return await run_in_threadpool(societies_service.list_members, repo, society.society_id)


@router.put("/r/{slug}/moderators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_moderator(user: ActiveUser, slug: str, user_id: str) -> None:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    await run_in_threadpool(
        societies_service.set_moderator,
        repo,
        society_id=society.society_id,
        actor_user_id=user.user_id,
        target_user_id=user_id,
        is_moderator=True,
    )


@router.delete("/r/{slug}/moderators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_moderator(user: ActiveUser, slug: str, user_id: str) -> None:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    await run_in_threadpool(
        societies_service.set_moderator,
        repo,
        society_id=society.society_id,
        actor_user_id=user.user_id,
        target_user_id=user_id,
        is_moderator=False,
    )


app = create_api("RMIT Society societies")
app.include_router(router)
handler = Mangum(app, lifespan="off")
