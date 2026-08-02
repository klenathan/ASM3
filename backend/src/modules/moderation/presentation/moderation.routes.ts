import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { ModerationService } from "../application/moderation.service";
import type { ReportService } from "../application/report.service";
import { createModerationController } from "./moderation.controller";
import {
  createReportRequestSchema,
  dismissReportRequestSchema,
  errorSchema,
  moderationDecisionRequestSchema,
  moderationPageQuerySchema,
  reportPageSchema,
  reportSchema,
  resolveReportRequestSchema,
} from "./moderation.schemas";

const reportParams = z.object({ reportId: z.string().uuid() });
const societySlugParams = z.object({ societySlug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/) });

const listReporterReportsRoute = createRoute({
  method: "get",
  path: "/api/v1/reports",
  tags: ["Reports"],
  summary: "List reports filed by the current user",
  request: { query: moderationPageQuerySchema },
  responses: {
    200: { description: "Reports", content: { "application/json": { schema: reportPageSchema } } },
    400: { description: "Invalid pagination", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const createReportRoute = createRoute({
  method: "post",
  path: "/api/v1/reports",
  tags: ["Reports"],
  summary: "Report a thread or comment",
  request: { body: { content: { "application/json": { schema: createReportRequestSchema } } } },
  responses: {
    201: { description: "Report created", content: { "application/json": { schema: reportSchema } } },
    400: { description: "Invalid report", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society or content was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "An active duplicate report already exists", content: { "application/json": { schema: errorSchema } } },
  },
});

const listSocietyReportsRoute = createRoute({
  method: "get",
  path: "/api/v1/mod/societies/{societySlug}/reports",
  tags: ["Moderation"],
  summary: "List the active moderation queue for a society",
  request: { params: societySlugParams, query: moderationPageQuerySchema },
  responses: {
    200: { description: "Moderation queue", content: { "application/json": { schema: reportPageSchema } } },
    400: { description: "Invalid pagination", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const getReportRoute = createRoute({
  method: "get",
  path: "/api/v1/mod/reports/{reportId}",
  tags: ["Moderation"],
  summary: "Get a report",
  request: { params: reportParams },
  responses: {
    200: { description: "Report", content: { "application/json": { schema: reportSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Report was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const claimReportRoute = createRoute({
  method: "post",
  path: "/api/v1/mod/reports/{reportId}/claim",
  tags: ["Moderation"],
  summary: "Claim a pending report",
  request: { params: reportParams },
  responses: {
    200: { description: "Claimed report", content: { "application/json": { schema: reportSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Report was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Report has already been claimed", content: { "application/json": { schema: errorSchema } } },
  },
});

const resolveReportRoute = createRoute({
  method: "post",
  path: "/api/v1/mod/reports/{reportId}/resolve",
  tags: ["Moderation"],
  summary: "Resolve a report with a moderation action",
  request: {
    params: reportParams,
    body: { content: { "application/json": { schema: resolveReportRequestSchema } } },
  },
  responses: {
    200: { description: "Resolved report", content: { "application/json": { schema: reportSchema } } },
    400: { description: "Invalid resolution", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Report or target was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Report cannot be resolved", content: { "application/json": { schema: errorSchema } } },
  },
});

const dismissReportRoute = createRoute({
  method: "post",
  path: "/api/v1/mod/reports/{reportId}/dismiss",
  tags: ["Moderation"],
  summary: "Dismiss a report",
  request: {
    params: reportParams,
    body: { content: { "application/json": { schema: dismissReportRequestSchema } } },
  },
  responses: {
    200: { description: "Dismissed report", content: { "application/json": { schema: reportSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Report was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Report cannot be dismissed", content: { "application/json": { schema: errorSchema } } },
  },
});

const decideReportRoute = createRoute({
  method: "patch",
  path: "/api/v1/mod/reports/{reportId}",
  tags: ["Moderation"],
  summary: "Resolve or dismiss a report",
  request: {
    params: reportParams,
    body: { content: { "application/json": { schema: moderationDecisionRequestSchema } } },
  },
  responses: {
    200: { description: "Updated report", content: { "application/json": { schema: reportSchema } } },
    400: { description: "Invalid decision", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Report or target was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Report cannot be updated", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface ModerationRouteDependencies {
  readonly reportService: ReportService;
  readonly moderationService: ModerationService;
}

export function registerModerationRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: ModerationRouteDependencies,
): void {
  const controller = createModerationController(dependencies);
  app.openapi(listReporterReportsRoute, (context) => controller.listReporterReports(context) as never);
  app.openapi(createReportRoute, (context) => controller.createReport(context) as never);
  app.openapi(listSocietyReportsRoute, (context) => controller.listSocietyReports(context) as never);
  app.openapi(getReportRoute, (context) => controller.getReport(context) as never);
  app.openapi(claimReportRoute, (context) => controller.claimReport(context) as never);
  app.openapi(resolveReportRoute, (context) => controller.resolveReport(context) as never);
  app.openapi(dismissReportRoute, (context) => controller.dismissReport(context) as never);
  app.openapi(decideReportRoute, (context) => controller.decideReport(context) as never);
}

export const registerReportsRoutes = registerModerationRoutes;
