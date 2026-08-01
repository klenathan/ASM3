from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from rmit_society.auth import middleware
from rmit_society.auth.claims import Claims, Role, UserStatus
from rmit_society.auth.dependencies import AuthenticatedUser, require_admin
from rmit_society.errors import AuthenticationError, DomainError


def _user(role: Role) -> AuthenticatedUser:
    return AuthenticatedUser(
        Claims(
            subject="subject-1",
            institution_id="rmit",
            role=role,
            status=UserStatus.ACTIVE,
        ),
        user_id="user-1",
    )


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(middleware.AuthenticationMiddleware)

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError) -> JSONResponse:
        del request
        return JSONResponse(status_code=error.status_code, content=error.public())

    @app.get("/private")
    def private(request: Request) -> dict[str, str]:
        user = request.state.authenticated_user
        return {"user_id": user.user_id, "role": user.role.value}

    @app.get("/admin")
    def admin(
        user: Annotated[AuthenticatedUser, Depends(require_admin)],
    ) -> dict[str, str]:
        return {"user_id": user.user_id}

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def test_missing_token_is_rejected_before_handler() -> None:
    response = TestClient(_app()).get("/private")

    assert response.status_code == 401
    assert response.json()["error"] == "unauthenticated"


def test_invalid_token_is_rejected_before_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject(token: str) -> Claims:
        del token
        raise AuthenticationError("Invalid token")

    monkeypatch.setattr(middleware, "claims_from_token", reject)

    response = TestClient(_app()).get(
        "/private", headers={"Authorization": "Bearer invalid-token"}
    )

    assert response.status_code == 401
    assert response.json()["error"] == "unauthenticated"


def test_middleware_passes_authenticated_context_to_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(middleware, "_repository", lambda: object())
    monkeypatch.setattr(middleware, "claims_from_token", lambda token: Claims(
        subject=token,
        institution_id="rmit",
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
    ))
    monkeypatch.setattr(
        middleware,
        "resolve_authenticated_user",
        lambda claims, repo: _user(Role.STUDENT),
    )

    response = TestClient(_app()).get(
        "/private", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": "user-1", "role": "STUDENT"}


def test_admin_role_guard_allows_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(middleware, "_repository", lambda: object())
    monkeypatch.setattr(
        middleware,
        "claims_from_token",
        lambda token: Claims(
            subject=token,
            institution_id="rmit",
            role=Role.RMIT_ADMIN,
            status=UserStatus.ACTIVE,
        ),
    )
    monkeypatch.setattr(
        middleware,
        "resolve_authenticated_user",
        lambda claims, repo: _user(Role.RMIT_ADMIN),
    )

    response = TestClient(_app()).get(
        "/admin", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": "user-1"}


def test_admin_role_guard_rejects_regular_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(middleware, "_repository", lambda: object())
    monkeypatch.setattr(
        middleware,
        "claims_from_token",
        lambda token: Claims(
            subject=token,
            institution_id="rmit",
            role=Role.STUDENT,
            status=UserStatus.ACTIVE,
        ),
    )
    monkeypatch.setattr(
        middleware,
        "resolve_authenticated_user",
        lambda claims, repo: _user(Role.STUDENT),
    )

    response = TestClient(_app()).get(
        "/admin", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_health_remains_public() -> None:
    response = TestClient(_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
