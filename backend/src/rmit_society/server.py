"""Canonical combined ASGI application for the deployed backend.

The backend runs as a persistent server (EC2 in dev/prod, uvicorn locally)
rather than as per-domain Lambda functions. It mounts every domain router
under ``/api/v1`` plus a ``/api/v1/health`` probe, and is the entry point the
backend container runs (see ``backend/Dockerfile``).

Keeping a single running server instead of one Lambda per domain removes the
per-function Mangum wrappers from the request path and makes the same process
trivially runnable in local development:

    uv run uvicorn rmit_society.server:app --app-dir src --port 8000
"""

from __future__ import annotations

from fastapi import APIRouter

from rmit_society.api import create_api
from rmit_society.base import utc_now
from rmit_society.handlers.analytics import router as analytics_router
from rmit_society.handlers.auth import router as auth_router
from rmit_society.handlers.content import router as content_router
from rmit_society.handlers.engagement import router as engagement_router
from rmit_society.handlers.identity import router as identity_router
from rmit_society.handlers.media import router as media_router
from rmit_society.handlers.moderation import router as moderation_router
from rmit_society.handlers.societies import router as societies_router

app = create_api("RMIT Society local API")

_combined = APIRouter()
_combined.include_router(auth_router)
_combined.include_router(identity_router)
_combined.include_router(societies_router)
_combined.include_router(content_router)
_combined.include_router(engagement_router)
_combined.include_router(moderation_router)
_combined.include_router(media_router)
_combined.include_router(analytics_router)


@_combined.get(
    "/health",
    tags=["system"],
    summary="Check API health",
    description="Returns a lightweight liveness response without requiring authentication.",
)
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "rmit-society", "time": utc_now()}


app.include_router(_combined, prefix="/api/v1")

__all__ = ["app"]
