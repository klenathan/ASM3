import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnvironment } from "../../../app-types";
import { AppError, ApplicationError } from "../../../shared/domain/errors";
import { mapError } from "../../../shared/presentation/error-mapping";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";

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

export function getInjectedPrincipal(
  context: Context<AppEnvironment>,
): RequestPrincipal | undefined {
  const principal = (context as unknown as PrincipalContext).get("principal");
  return isRequestPrincipal(principal) ? principal : undefined;
}

export function requireInjectedPrincipal(context: Context<AppEnvironment>): RequestPrincipal {
  const principalContext = context as unknown as PrincipalContext;
  const principalError = principalContext.get("principalError");
  if (principalError instanceof AppError) throw principalError;
  const principal = getInjectedPrincipal(context);
  if (principal === undefined) {
    throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
  }
  return principal;
}

export function discussionErrorResponse(
  context: Context<AppEnvironment>,
  error: unknown,
): Response {
  const mapped = mapError(error, context.get("requestId"));
  return context.json(mapped.body, mapped.status as ContentfulStatusCode);
}

function isRequestPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === "string"
    && (candidate.platformRole === "student" || candidate.platformRole === "system_admin");
}
