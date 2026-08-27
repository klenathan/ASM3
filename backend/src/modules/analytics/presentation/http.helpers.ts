import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import { AppError, ApplicationError } from "../../../shared/domain/errors";
import { errorResponse } from "../../../shared/presentation/error-response";
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

export function requireInjectedPrincipal(context: Context<AppEnvironment>): RequestPrincipal {
  const principalContext = context as unknown as PrincipalContext;
  const principalError = principalContext.get("principalError");
  if (principalError instanceof AppError) throw principalError;
  const principal = principalContext.get("principal");
  if (!isRequestPrincipal(principal)) {
    throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
  }
  return principal;
}

export function analyticsErrorResponse(
  context: Context<AppEnvironment>,
  error: unknown,
): Response {
  return errorResponse(context, error);
}

function isRequestPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === "string"
    && (candidate.platformRole === "student" || candidate.platformRole === "system_admin");
}