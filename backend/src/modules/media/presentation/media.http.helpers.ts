import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import { AppError, ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";

export function validated<T>(
  context: Context<AppEnvironment>,
  target: "json" | "param",
): T {
  const request = context.req as unknown as {
    valid(name: "json" | "param"): unknown;
  };
  return request.valid(target) as T;
}

export function getPrincipal(context: Context<AppEnvironment>): RequestPrincipal {
  const principal = context.get("principal");
  if (isPrincipal(principal)) return principal;
  const principalError = context.get("principalError");
  if (principalError instanceof AppError) throw principalError;
  throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
}

function isPrincipal(value: unknown): value is RequestPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === "string"
    && (candidate.platformRole === "student" || candidate.platformRole === "system_admin");
}
