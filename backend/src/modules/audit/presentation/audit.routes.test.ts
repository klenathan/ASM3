import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { AuditTrailService } from "../application/audit-trail.service";
import { registerAuditRoutes } from "./audit.routes";

const principal: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "system_admin",
};

describe("audit HTTP routes", () => {
  it("lists audit events with pagination and the authenticated administrator", async () => {
    const auditService = {
      listEvents: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    };
    const app = new OpenAPIHono<AppEnvironment>();
    app.use("*", async (context, next) => {
      context.set("principal", principal);
      await next();
    });
    registerAuditRoutes(app, { auditService: auditService as unknown as AuditTrailService });

    const response = await app.request("/api/v1/admin/audit?limit=25&cursor=next-page");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(auditService.listEvents).toHaveBeenCalledWith(principal, {
      limit: 25,
      cursor: "next-page",
    });
  });
});
