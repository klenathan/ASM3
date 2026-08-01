from __future__ import annotations

from typing import Any


class DomainError(Exception):
    """Base class for expected, client-facing errors."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def public(self) -> dict[str, Any]:
        return {
            "error": self.code,
            "message": self.message,
            "details": self.details,
        }


class AuthorizationError(DomainError):
    status_code = 403
    code = "forbidden"


class AuthenticationError(DomainError):
    status_code = 401
    code = "unauthenticated"


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class ValidationError_(DomainError):
    status_code = 422
    code = "validation"


class RateLimitedError(DomainError):
    status_code = 429
    code = "rate_limited"


class ModerationInProgressError(DomainError):
    status_code = 409
    code = "moderation_in_progress"


class ProviderError(DomainError):
    status_code = 502
    code = "provider_error"
