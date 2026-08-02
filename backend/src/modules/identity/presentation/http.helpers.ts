import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnvironment } from "../../../app-types";
import { AppError, ApplicationError } from "../../../shared/domain/errors";
import { mapError } from "../../../shared/presentation/error-mapping";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";

const identityStatusByCode: Readonly<Record<string, ContentfulStatusCode>> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_REQUIRED: 401,
  USER_SUSPENDED: 403,
  USER_DEACTIVATED: 403,
  ADMIN_REQUIRED: 403,
  SELF_ADMIN_ACTION_FORBIDDEN: 403,
  EMAIL_DOMAIN_NOT_ALLOWED: 403,
  REGISTRATION_CLOSED: 503,
  INVALID_EMAIL: 400,
  INVALID_PASSWORD: 400,
  INVALID_DISPLAY_NAME: 400,
  INVALID_BIO: 400,
  INVALID_SUSPENSION: 400,
  EMAIL_ALREADY_REGISTERED: 409,
  USER_NOT_FOUND: 404,
  IDENTITY_DATA_INVALID: 500,
  PASSWORD_HASH_FAILED: 500,
};

type PrincipalContext = {
  get(key: string): unknown;
};

export function getInjectedPrincipal(context: Context<AppEnvironment>): RequestPrincipal | undefined {
  const value = (context as unknown as PrincipalContext).get("principal");
  if (!isRequestPrincipal(value)) return undefined;
  return value;
}

export function requireInjectedPrincipal(context: Context<AppEnvironment>): RequestPrincipal {
  const principalError = (context as unknown as PrincipalContext).get("principalError");
  if (principalError instanceof AppError) throw principalError;

  const principal = getInjectedPrincipal(context);
  if (principal === undefined) {
    throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
  }

  return principal;
}

export function identityErrorResponse(
  context: Context<AppEnvironment>,
  error: unknown,
): Response {
  const requestId = context.get("requestId");
  const mapped = mapError(error, requestId);
  const status = identityStatusByCode[mapped.body.error.code] ?? mapped.status;
  return context.json(mapped.body, status as ContentfulStatusCode);
}

function isRequestPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    (candidate.platformRole === "student" || candidate.platformRole === "system_admin")
  );
}
