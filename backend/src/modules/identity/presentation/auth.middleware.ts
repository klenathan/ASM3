import type { MiddlewareHandler } from "hono";

import type { AppEnvironment } from "../../../app-types";
import { AppError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { AuthService } from "../application/auth.service";

export const SESSION_COOKIE_NAME = "rmit_session";

export interface SessionPrincipalMiddlewareDependencies {
  readonly authService: Pick<AuthService, "authenticateSession">;
  readonly cookieName?: string;
}

export function extractSessionToken(
  request: Request,
  cookieName = SESSION_COOKIE_NAME,
): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
    if (match?.[1] !== undefined) return match[1];
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) return null;

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== cookieName) continue;
    return decodeCookieValue(item.slice(separator + 1).trim());
  }

  return null;
}

export function sessionPrincipalMiddleware(
  dependencies: SessionPrincipalMiddlewareDependencies,
): MiddlewareHandler<AppEnvironment> {
  const cookieName = dependencies.cookieName ?? SESSION_COOKIE_NAME;

  return async (context, next) => {
    const token = extractSessionToken(context.req.raw, cookieName);
    if (token !== null) {
      try {
        const principal = await dependencies.authService.authenticateSession(token);
        setPrincipal(context, principal);
      } catch (error) {
        if (error instanceof AppError) {
          setContextValue(context, "principalError", error);
        }
      }
    }

    await next();
  };
}

function setPrincipal(
  context: { set(name: string, value: unknown): void },
  principal: RequestPrincipal,
): void {
  context.set("principal", principal);
}

function setContextValue(
  context: unknown,
  name: string,
  value: unknown,
): void {
  (context as { set(key: string, value: unknown): void }).set(name, value);
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
