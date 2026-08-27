import { OpenAPIHono } from "@hono/zod-openapi";
import pino from "pino";
import { describe, expect, it } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import { ApplicationError } from "../../../shared/domain/errors";
import type { AnalyticsService } from "../application/analytics.service";
import { registerAnalyticsRoutes, SCHEDULER_SECRET_HEADER } from "./analytics.routes";

describe("analytics scheduled-refresh route", () => {
  it.each([
    ["missing", undefined],
    ["invalid", "wrong-secret"],
  ])("maps %s scheduler secrets to 401", async (_label, secret) => {
    const app = createTestApp();
    const headers = secret === undefined ? {} : { [SCHEDULER_SECRET_HEADER]: secret };
    const response = await app.request(
      new Request("http://localhost/api/v1/admin/analytics/scheduled-refresh", {
        method: "POST",
        headers,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("forwards a valid secret and returns 202", async () => {
    let presentedSecret: string | undefined;
    const app = createTestApp(async (secret) => {
      presentedSecret = secret;
      return { accepted: true, message: "queued" };
    });
    const response = await app.request(
      new Request("http://localhost/api/v1/admin/analytics/scheduled-refresh", {
        method: "POST",
        headers: { [SCHEDULER_SECRET_HEADER]: "scheduler-secret" },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, message: "queued" });
    expect(presentedSecret).toBe("scheduler-secret");
  });
});

function createTestApp(
  scheduledRefresh: (secret: string | undefined) => Promise<{ accepted: boolean; message: string }> = async () => {
    throw new ApplicationError("AUTH_REQUIRED", "A valid scheduler secret header is required");
  },
) {
  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("logger", pino({ enabled: false }));
    await next();
  });
  const analyticsService = {
    scheduledRefresh,
  } as unknown as AnalyticsService;
  registerAnalyticsRoutes(app, { analyticsService });
  return app;
}
