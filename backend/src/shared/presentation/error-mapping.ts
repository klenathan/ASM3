import { AppError, DomainError } from "../domain/errors";

export interface ErrorResponse {
  readonly status: number;
  readonly body: {
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly requestId: string;
      readonly details: Record<string, unknown>;
    };
  };
}

const statusByCode: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  ADMIN_REQUIRED: 403,
  SOCIETY_FORBIDDEN: 403,
  ANALYTICS_FORBIDDEN: 403,
  ANALYTICS_SOCIETY_REQUIRED: 400,
  ANALYTICS_SOCIETY_NOT_MODERATED: 403,
  MEDIA_NOT_OWNER: 403,
  MEDIA_OBJECT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  ANALYTICS_REFRESH_BUSY: 409,
  INVALID_CURSOR: 400,
  VALIDATION_ERROR: 400,
  LOCATION_NOT_FOUND: 400,
  PLACES_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
};

export function mapError(error: unknown, requestId: string): ErrorResponse {
  if (error instanceof AppError) {
    return {
      status: statusByCode[error.code] ?? (error instanceof DomainError ? 409 : 400),
      body: {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: { ...error.details },
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
        details: {},
      },
    },
  };
}
