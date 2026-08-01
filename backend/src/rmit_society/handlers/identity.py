from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.claims import Claims
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    resolve_claims,
    resolve_current_user,
)
from rmit_society.domain.users import User, UserProfileUpdate
from rmit_society.errors import NotFoundError
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import identity as identity_service

repo = DynamoDBRepository()
router = APIRouter(tags=["identity"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
TokenClaims = Annotated[Claims, Depends(resolve_claims)]


@router.post("/me/bootstrap", response_model=User, status_code=status.HTTP_201_CREATED)
async def bootstrap(claims: TokenClaims) -> User:
    return await run_in_threadpool(
        identity_service.bootstrap_user,
        repo,
        cognito_sub=claims.subject,
        handle=f"u{claims.subject[:8]}",
        display_name=claims.subject[:12],
        role=claims.role,
        institution_id=claims.institution_id,
    )


@router.get("/me", response_model=User)
async def me(user: CurrentUser) -> User:
    try:
        return await run_in_threadpool(identity_service.get_current_user, repo, user.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@router.patch("/me", response_model=User)
async def update_me(user: CurrentUser, payload: UserProfileUpdate) -> User:
    return await run_in_threadpool(identity_service.update_profile, repo, user.user_id, payload)


@router.post("/me/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate(user: CurrentUser) -> None:
    await run_in_threadpool(identity_service.deactivate, repo, user.user_id)


@router.get("/users/{handle}", response_model=User)
async def user_by_handle(handle: str) -> User:
    return await run_in_threadpool(identity_service.get_user_by_handle, repo, handle)


app = create_api("RMIT Society identity")
app.include_router(router)
handler = Mangum(app, lifespan="off")
