import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import type { AuthService } from "./modules/identity/application/auth.service";
import type { UserService } from "./modules/identity/application/user.service";
import type { AnalyticsService } from "./modules/analytics/application/analytics.service";

describe("createApp analytics authentication", () => {
  it("authenticates v2 analytics refresh requests with the session cookie", async () => {
    const principal = { userId: "admin-1", platformRole: "system_admin" as const };
    const authenticateSession = vi.fn(async () => principal);
    const refresh = vi.fn(async () => ({
      accepted: true,
      message: "queued",
      runId: "00000000-0000-4000-8000-000000000001",
      status: "requested" as const,
    }));
    const app = createApp({
      config: { webOrigin: "http://localhost:5173", nodeEnv: "test" },
      logger: pino({ enabled: false }),
      checkReadiness: async () => undefined,
      identity: {
        authService: { authenticateSession } as unknown as AuthService,
        userService: {} as UserService,
      },
      analytics: { analyticsService: { refresh } as unknown as AnalyticsService },
    });

    const response = await app.request(
      new Request("http://localhost/api/v2/admin/analytics/refresh", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "rmit_session=session-token",
        },
        body: JSON.stringify({ periodStart: "2026-09-01", periodEnd: "2026-09-07" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(authenticateSession).toHaveBeenCalledWith("session-token");
    expect(refresh).toHaveBeenCalledWith(
      principal,
      {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-07",
      },
    );
  });
  it("returns the latest v2 analytics refresh status with the session cookie", async () => {
    const principal = { userId: "admin-1", platformRole: "system_admin" as const };
    const authenticateSession = vi.fn(async () => principal);
    const refreshStatus = vi.fn(async () => ({
      runId: "00000000-0000-4000-8000-000000000002",
      trigger: "admin" as const,
      status: "querying" as const,
      attempts: 1,
      lastError: null,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:01:00.000Z",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-04",
    }));
    const app = createApp({
      config: { webOrigin: "http://localhost:5173", nodeEnv: "test" },
      logger: pino({ enabled: false }),
      checkReadiness: async () => undefined,
      identity: {
        authService: { authenticateSession } as unknown as AuthService,
        userService: {} as UserService,
      },
      analytics: { analyticsService: { refreshStatus } as unknown as AnalyticsService },
    });

    const response = await app.request(
      new Request("http://localhost/api/v2/admin/analytics/refresh/status", {
        headers: { cookie: "rmit_session=session-token" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(await refreshStatus());
    expect(authenticateSession).toHaveBeenCalledWith("session-token");
    expect(refreshStatus).toHaveBeenCalledWith(principal);
  });
});
