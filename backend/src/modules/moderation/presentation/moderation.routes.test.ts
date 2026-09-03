import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { ModerationService } from "../application/moderation.service";
import type { ReportService } from "../application/report.service";
import { registerModerationRoutes } from "./moderation.routes";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student" as const,
};
const societyId = "00000000-0000-4000-8000-000000000010";
const threadId = "00000000-0000-4000-8000-000000000011";
const reportId = "00000000-0000-4000-8000-000000000012";

function makeApp() {
  const reportService = {
    createReport: vi.fn(async () => ({ id: reportId, status: "pending" })),
    listReporterReports: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  };
  const moderationService = {
    listSocietyReports: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listAllReports: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getReport: vi.fn(async () => ({ id: reportId, status: "pending" })),
    claimReport: vi.fn(async () => ({ id: reportId, status: "in_review" })),
    resolveReport: vi.fn(async () => ({ id: reportId, status: "resolved" })),
    dismissReport: vi.fn(async () => ({ id: reportId, status: "dismissed" })),
  };

  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerModerationRoutes(app, {
    reportService: reportService as unknown as ReportService,
    moderationService: moderationService as unknown as ModerationService,
  });
  return { app, reportService, moderationService };
}

describe("moderation HTTP routes", () => {
  it("creates a report and lists the reporter's reports", async () => {
    const { app, reportService } = makeApp();

    const created = await app.request("/api/v1/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        societyId,
        threadId,
        reason: "Spam",
        details: "Repeated promotional links",
      }),
    });
    expect(created.status).toBe(201);
    expect(reportService.createReport).toHaveBeenCalledWith(principal, {
      societyId,
      threadId,
      reason: "Spam",
      details: "Repeated promotional links",
    });

    const listed = await app.request("/api/v1/reports?limit=10");
    expect(listed.status).toBe(200);
    expect(reportService.listReporterReports).toHaveBeenCalledWith(principal, { limit: 10 });
  });

  it("claims and resolves a report with the requested moderation action", async () => {
    const { app, moderationService } = makeApp();

    const claimed = await app.request(`/api/v1/mod/reports/${reportId}/claim`, { method: "POST" });
    expect(claimed.status).toBe(200);
    expect(moderationService.claimReport).toHaveBeenCalledWith(principal, reportId);

    const resolved = await app.request(`/api/v1/mod/reports/${reportId}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove_content", resolutionNote: "Removed spam" }),
    });
    expect(resolved.status).toBe(200);
    expect(moderationService.resolveReport).toHaveBeenCalledWith(principal, reportId, {
      action: "remove_content",
      resolutionNote: "Removed spam",
    });

    const dismissed = await app.request(`/api/v1/mod/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "dismissed", resolutionNote: "Duplicate" }),
    });
    expect(dismissed.status).toBe(200);
    expect(moderationService.dismissReport).toHaveBeenCalledWith(principal, reportId, {
      resolutionNote: "Duplicate",
    });
  });
});
