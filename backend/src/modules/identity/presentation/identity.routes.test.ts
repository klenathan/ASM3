import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../app";
import type { AuthService } from "../application/auth.service";
import type { UserService } from "../application/user.service";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";

const principal: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student",
};
const user = {
  userId: principal.userId,
  email: "student@rmit.edu.au",
  displayName: "Student",
  bio: null,
  avatarMediaId: null,
  platformRole: "student" as const,
  status: "active" as const,
  isPublic: true,
  suspendedUntil: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const authResult = {
  user,
  sessionToken: "session-token",
  expiresAt: "2026-02-01T00:00:00.000Z",
};

function makeApp() {
  const authService = {
    register: vi.fn(async () => authResult),
    signIn: vi.fn(async () => authResult),
    signOut: vi.fn(async () => undefined),
    authenticateSession: vi.fn(async () => principal),
    currentUser: vi.fn(async () => user),
  };
  const userService = {
    getProfile: vi.fn(async () => user),
    getPublicProfile: vi.fn(async (_requester: RequestPrincipal | undefined, userId: string) => ({
      userId,
      displayName: user.displayName,
      bio: user.bio,
      avatarMediaId: user.avatarMediaId,
      platformRole: user.platformRole,
      status: user.status,
      isPublic: user.isPublic,
      isOwner: userId === principal.userId,
      createdAt: user.createdAt,
    })),
    updateProfile: vi.fn(async () => user),
  };

  const app = createApp({
    config: { webOrigin: "http://localhost:5173", nodeEnv: "test" },
    logger: pino({ enabled: false }),
    checkReadiness: async () => undefined,
    identity: {
      authService: authService as unknown as AuthService,
      userService: userService as unknown as UserService,
    },
  });
  return { app, authService, userService };
}

describe("identity HTTP routes", () => {
  it("registers an account and sets the session cookie", async () => {
    const { app, authService } = makeApp();

    const response = await app.request("http://localhost/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student@rmit.edu.au",
        password: "password123",
        displayName: "Student",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(authResult);
    expect(authService.register).toHaveBeenCalledWith({
      email: "student@rmit.edu.au",
      password: "password123",
      displayName: "Student",
    });
    expect(response.headers.get("set-cookie")).toContain("rmit_session=session-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("signs in, signs out, and clears the session cookie", async () => {
    const { app, authService } = makeApp();

    const signIn = await app.request("http://localhost/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@rmit.edu.au", password: "password123" }),
    });
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("set-cookie")).toContain("rmit_session=session-token");

    const signOut = await app.request("http://localhost/api/v1/auth/sign-out", {
      method: "POST",
      headers: { cookie: "rmit_session=session-token" },
    });
    expect(signOut.status).toBe(204);
    expect(authService.signOut).toHaveBeenCalledWith("session-token");
    expect(signOut.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("authenticates the current user and nested profile routes", async () => {
    const { app, authService, userService } = makeApp();

    const current = await app.request("http://localhost/api/v1/auth/me", {
      headers: { cookie: "rmit_session=session-token" },
    });
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toEqual(user);
    expect(authService.authenticateSession).toHaveBeenCalledWith("session-token");
    expect(authService.currentUser).toHaveBeenCalledWith(principal);

    const publicProfile = await app.request(
      `http://localhost/api/v1/users/${principal.userId}`,
      { headers: { cookie: "rmit_session=session-token" } },
    );
    expect(publicProfile.status).toBe(200);
    expect(userService.getPublicProfile).toHaveBeenCalledWith(principal, principal.userId);
  });

  it("rejects protected profile requests without a session", async () => {
    const { app } = makeApp();

    const response = await app.request("http://localhost/api/v1/users/me");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });
});
