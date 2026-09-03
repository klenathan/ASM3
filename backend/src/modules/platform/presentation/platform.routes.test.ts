import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { PlatformService } from "../application/platform.service";
import { registerPlatformRoutes } from "./platform.routes";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "system_admin" as const,
};

function makeApp() {
  const platformService = {
    listConfig: vi.fn(async () => [{ key: "allowed_email_domains", value: "rmit.edu.au", updatedAt: null }]),
    upsertConfig: vi.fn(async () => ({ key: "allowed_email_domains", value: "rmit.edu.au", updatedAt: null })),
    health: vi.fn(async () => ({
      status: "ok",
      database: "ok",
      uptimeSeconds: 2,
      serverTime: "2026-09-03T00:00:00.000Z",
    })),
  };
  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerPlatformRoutes(app, { platformService: platformService as unknown as PlatformService });
  return { app, platformService };
}

describe("platform administration HTTP routes", () => {
  it("lists and updates platform configuration", async () => {
    const { app, platformService } = makeApp();

    const listed = await app.request("/api/v1/admin/config");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ items: [{ key: "allowed_email_domains" }] });
    expect(platformService.listConfig).toHaveBeenCalledWith(principal);

    const updated = await app.request("/api/v1/admin/config/allowed_email_domains", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "rmit.edu.au,rmit.edu.vn" }),
    });
    expect(updated.status).toBe(200);
    expect(platformService.upsertConfig).toHaveBeenCalledWith(
      principal,
      "allowed_email_domains",
      "rmit.edu.au,rmit.edu.vn",
    );
  });

  it("returns the administrator health view", async () => {
    const { app, platformService } = makeApp();

    const response = await app.request("/api/v1/admin/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", database: "ok" });
    expect(platformService.health).toHaveBeenCalledWith(principal);
  });
});
