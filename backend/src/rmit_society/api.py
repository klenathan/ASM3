from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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


def _error_handler(request: Request, error: DomainError) -> JSONResponse:
    del request
    return JSONResponse(status_code=error.status_code, content=error.public())


def create_api(title: str) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=title, version="0.1.0")
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
