import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  extractSessionToken,
  sessionPrincipalMiddleware,
} from "./auth.middleware";

const principal: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student",
};

describe("extractSessionToken", () => {
  it("prefers a bearer token over the session cookie", () => {
    const request = new Request("http://localhost", {
      headers: {
        authorization: "Bearer bearer-token",
        cookie: "rmit_session=cookie-token",
      },
    });

    expect(extractSessionToken(request)).toBe("bearer-token");
  });

  it("decodes a session cookie and ignores unrelated cookies", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "theme=dark; rmit_session=session%20token; other=value" },
    });

    expect(extractSessionToken(request)).toBe("session token");
  });

  it("returns null for malformed or missing credentials", () => {
    expect(
      extractSessionToken(
        new Request("http://localhost", { headers: { authorization: "Basic abc" } }),
      ),
    ).toBeNull();
    expect(extractSessionToken(new Request("http://localhost"))).toBeNull();
  });
});

describe("sessionPrincipalMiddleware", () => {
  it("injects the authenticated principal and continues the request", async () => {
    const authenticateSession = vi.fn(async (token: string) => {
      expect(token).toBe("session-token");
      return principal;
    });
    const next = vi.fn(async () => undefined);
    const context = {
      req: { raw: new Request("http://localhost", { headers: { authorization: "Bearer session-token" } }) },
      set: vi.fn(),
    };

    await sessionPrincipalMiddleware({ authService: { authenticateSession } as never })(
      context as never,
      next,
    );

    expect(context.set).toHaveBeenCalledWith("principal", principal);
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not abort the request when session authentication fails", async () => {
    const authenticateSession = vi.fn(async () => {
      throw new ApplicationError("AUTH_REQUIRED", "Session is invalid");
    });
    const next = vi.fn(async () => undefined);
    const set = vi.fn();
    const context = {
      req: { raw: new Request("http://localhost", { headers: { cookie: "rmit_session=expired" } }) },
      set,
    };

    await sessionPrincipalMiddleware({ authService: { authenticateSession } as never })(
      context as never,
      next,
    );

    expect(set).toHaveBeenCalledWith("principalError", expect.any(ApplicationError));
    expect(set).not.toHaveBeenCalledWith("principal", expect.anything());
    expect(next).toHaveBeenCalledOnce();
  });
});
