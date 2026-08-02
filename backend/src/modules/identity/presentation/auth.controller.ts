import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import type { AppEnvironment } from "../../../app-types";
import type { AuthService } from "../application/auth.service";
import type { RegisterCommand, SignInCommand } from "../application/identity.dto";
import {
  extractSessionToken,
  SESSION_COOKIE_NAME,
} from "./auth.middleware";
import {
  identityErrorResponse,
  requireInjectedPrincipal,
} from "./http.helpers";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthControllerDependencies {
  readonly authService: AuthService;
  readonly secureCookies?: boolean;
  readonly cookieName?: string;
}

export function createAuthController(dependencies: AuthControllerDependencies) {
  const cookieName = dependencies.cookieName ?? SESSION_COOKIE_NAME;

  return {
    async register(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const command = (await context.req.json()) as RegisterCommand;
        const result = await dependencies.authService.register(command);
        writeSessionCookie(context, result.sessionToken, cookieName, dependencies.secureCookies);
        return context.json(result, 201);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async signIn(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const command = (await context.req.json()) as SignInCommand;
        const result = await dependencies.authService.signIn(command);
        writeSessionCookie(context, result.sessionToken, cookieName, dependencies.secureCookies);
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async signOut(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const token = extractSessionToken(context.req.raw, cookieName);
        await dependencies.authService.signOut(token ?? "");
        deleteCookie(context, cookieName, { path: "/" });
        return context.body(null, 204);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async currentUser(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.authService.currentUser(principal);
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },
  };
}

function writeSessionCookie(
  context: Context<AppEnvironment>,
  token: string,
  cookieName: string,
  secureCookies = true,
): void {
  setCookie(context, cookieName, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}
