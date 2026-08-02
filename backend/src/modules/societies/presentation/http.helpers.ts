import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnvironment } from "../../../app-types";
import { AppError, ApplicationError } from "../../../shared/domain/errors";
import { mapError } from "../../../shared/presentation/error-mapping";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";

const societyStatusByCode: Readonly<Record<string, ContentfulStatusCode>> = {
  SOCIETY_DATA_INVALID: 500,
};

type PrincipalContext = {
  get(key: string): unknown;
};

export function validated<T>(
  context: Context<AppEnvironment>,
  target: "json" | "param" | "query",
): T {
  const request = context.req as unknown as {
    valid(name: "json" | "param" | "query"): unknown;
  };
  return request.valid(target) as T;
}

export function requireInjectedPrincipal(context: Context<AppEnvironment>): RequestPrincipal {
  const principalContext = context as unknown as PrincipalContext;
  const principalError = principalContext.get("principalError");
  if (principalError instanceof AppError) {
    throw principalError;
  }

  const principal = principalContext.get("principal");
  if (!isRequestPrincipal(principal)) {
    throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
  }

  return principal;
}

export function societyErrorResponse(context: Context<AppEnvironment>, error: unknown): Response {
  const mapped = mapError(error, context.get("requestId"));
  const status = societyStatusByCode[mapped.body.error.code] ?? mapped.status;
  return context.json(mapped.body, status as ContentfulStatusCode);
}

function isRequestPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === "string"
    && (candidate.platformRole === "student" || candidate.platformRole === "system_admin");
}
