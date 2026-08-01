from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from rmit_society.auth.middleware import AuthenticationMiddleware
from rmit_society.config import get_settings
from rmit_society.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    DomainError,
    NotFoundError,
    RateLimitedError,
    ValidationError_,
)

OPENAPI_TAGS = [
    {"name": "system", "description": "Service health and operational endpoints."},
    {"name": "auth", "description": "Local development authentication."},
    {"name": "identity", "description": "Profiles and institution membership identity."},
    {"name": "societies", "description": "School communities and membership."},
    {"name": "content", "description": "Posts, replies, and content lifecycle."},
    {"name": "engagement", "description": "Feeds, votes, follows, blocks, and notifications."},
    {"name": "media", "description": "Private media upload and access URLs."},
    {"name": "moderation", "description": "Moderation queues, appeals, and audit records."},
    {"name": "analytics", "description": "Asynchronous analytics queries and jobs."},
]

API_DESCRIPTION = """\
AI-assisted social forum API for authorized RMIT institution members.

Authenticated endpoints require a Cognito access token in the `Authorization: Bearer`
header. Content remains unavailable in public feeds until moderation approves it.
"""


def _error_handler(request: Request, error: DomainError) -> JSONResponse:
    del request
    return JSONResponse(status_code=error.status_code, content=error.public())


def create_api(title: str) -> FastAPI:
    settings = get_settings()
    openapi_url = "/openapi.json" if settings.openapi_enabled else None
    docs_url = "/docs" if settings.openapi_enabled else None
    redoc_url = "/redoc" if settings.openapi_enabled else None
    servers = (
        [{"url": settings.openapi_server_url, "description": "Configured API server"}]
        if settings.openapi_server_url
        else None
    )
    app = FastAPI(
        title=title,
        summary="Trusted school-community social forum API",
        description=API_DESCRIPTION,
        version=settings.api_version,
        openapi_url=openapi_url,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_tags=OPENAPI_TAGS,
        servers=servers,
        contact={"name": "RMIT Society platform team"},
    )
    app.add_middleware(AuthenticationMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for error_type in (
        AuthenticationError,
        AuthorizationError,
        NotFoundError,
        ConflictError,
        ValidationError_,
        RateLimitedError,
    ):
        app.exception_handler(error_type)(_error_handler)
    return app


__all__ = ["create_api"]
