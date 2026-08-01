from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from rmit_society.auth.dependencies import (
    _repository,
    resolve_authenticated_user,
)
from rmit_society.auth.jwt import claims_from_token
from rmit_society.errors import AuthenticationError, DomainError

# Authentication endpoints must be reachable before a caller has a token.
# Health and API documentation are operational/public discovery endpoints, not
# forum operations. Every other route is authenticated by this middleware.
_PUBLIC_PATHS = {
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/docs",
    "/api/v1/redoc",
    "/api/v1/openapi.json",
    "/health",
    "/api/v1/health",
}
_PUBLIC_PREFIXES = ("/auth", "/api/v1/auth")


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """Validate bearer tokens once and pass identity through request state."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if self._is_public(request):
            return await call_next(request)

        try:
            token = self._extract_token(request)
            claims = claims_from_token(token)
            # Role, status, institution, and profile existence come from the
            # server-side profile. JWT claims identify the Cognito subject only.
            user = resolve_authenticated_user(claims, _repository())
            if not user.is_active:
                raise AuthenticationError("Account is not active")
        except AuthenticationError as error:
            return JSONResponse(status_code=error.status_code, content=error.public())
        except DomainError as error:
            # Do not let an expected auth failure become an opaque 500 from the
            # middleware layer, which runs outside FastAPI route handlers.
            return JSONResponse(status_code=error.status_code, content=error.public())

        # request.state is the request-scoped context passed to dependencies and
        # handlers. Do not put identity in globals or mutable singleton state.
        request.state.authenticated_user = user
        request.state.auth_context = user
        return await call_next(request)

    @staticmethod
    def _is_public(request: Request) -> bool:
        path = request.scope.get("path", "")
        is_public_auth = any(
            path == prefix or path.startswith(f"{prefix}/")
            for prefix in _PUBLIC_PREFIXES
        )
        return request.method == "OPTIONS" or path in _PUBLIC_PATHS or is_public_auth

    @staticmethod
    def _extract_token(request: Request) -> str:
        authorization = request.headers.get("authorization", "")
        scheme, separator, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token.strip():
            raise AuthenticationError("Missing bearer token")
        return token.strip()


__all__ = ["AuthenticationMiddleware"]
