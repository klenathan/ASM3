from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import AuthenticatedUser, require_admin
from rmit_society.errors import ProviderError
from rmit_society.services import analytics as analytics_service

router = APIRouter(tags=["analytics"])
AdminUser = Annotated[AuthenticatedUser, Depends(require_admin)]


@router.post("/analytics/run", status_code=status.HTTP_202_ACCEPTED)
async def run_analytics(user: AdminUser) -> dict[str, str]:
    try:
        return await run_in_threadpool(analytics_service.run_container_analytics)
    except ProviderError as error:
        raise HTTPException(status_code=503, detail=error.message) from error


app = create_api("RMIT Society analytics")
app.include_router(router)
handler = Mangum(app, lifespan="off")
