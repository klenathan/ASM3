import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { AnalyticsService } from "../application/analytics.service";
import { createAnalyticsController } from "./analytics.controller";
import {
  actionAnalyticsPageSchema,
  actionAnalyticsQuerySchema,
  errorSchema,
  refreshCancellationResponseSchema,
  refreshRangeSchema,
  refreshResponseSchema,
  refreshStatusSchema,
} from "./analytics.schemas";

const scheduledRefreshRoute = createRoute({
  method: "post",
  path: "/api/v2/admin/analytics/scheduled-refresh",
  tags: ["Analytics"],
  summary: "Internal nightly analytics refresh entry point",
  responses: {
    200: {
      description: "Scheduled refresh was not started",
      content: { "application/json": { schema: refreshResponseSchema } },
    },
    202: {
      description: "Scheduled refresh accepted",
      content: { "application/json": { schema: refreshResponseSchema } },
    },
    401: {
      description: "A valid scheduler secret header is required",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const queryMetricsRoute = createRoute({
  method: "get",
  path: "/api/v2/admin/analytics",
  tags: ["Analytics"],
  summary: "Query action-event analytics metrics",
  request: { query: actionAnalyticsQuerySchema },
  responses: {
    200: { description: "Action metrics", content: { "application/json": { schema: actionAnalyticsPageSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const refreshRoute = createRoute({
  method: "post",
  path: "/api/v2/admin/analytics/refresh",
  tags: ["Analytics"],
  summary: "Refresh action-event analytics",
  request: { body: { content: { "application/json": { schema: refreshRangeSchema } } } },
  responses: {
    200: { description: "Refresh was not started", content: { "application/json": { schema: refreshResponseSchema } } },
    202: { description: "Refresh accepted", content: { "application/json": { schema: refreshResponseSchema } } },
    409: { description: "Another range is active", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const cancelRefreshRoute = createRoute({
  method: "post",
  path: "/api/v2/admin/analytics/refresh/cancel",
  tags: ["Analytics"],
  summary: "Cancel the latest queued or running analytics refresh",
  responses: {
    200: {
      description: "Cancellation result",
      content: { "application/json": { schema: refreshCancellationResponseSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const latestRefreshStatusRoute = createRoute({
  method: "get",
  path: "/api/v2/admin/analytics/refresh/status",
  tags: ["Analytics"],
  summary: "Get the latest action-event analytics refresh status",
  responses: {
    200: { description: "Latest refresh run", content: { "application/json": { schema: refreshStatusSchema.nullable() } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const refreshStatusRoute = createRoute({
  method: "get",
  path: "/api/v2/admin/analytics/refresh/:runId",
  tags: ["Analytics"],
  summary: "Get an analytics refresh run",
  request: { params: z.object({ runId: z.string().uuid() }) },
  responses: {
    200: { description: "Refresh run", content: { "application/json": { schema: refreshStatusSchema } } },
    404: { description: "Refresh run not found", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface AnalyticsRouteDependencies {
  readonly analyticsService: AnalyticsService;
}

export function registerAnalyticsRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: AnalyticsRouteDependencies,
): void {
  const controller = createAnalyticsController({
    analyticsService: dependencies.analyticsService,
  });
  app.openapi(scheduledRefreshRoute, (context) => controller.scheduledRefresh(context) as never);
  app.openapi(queryMetricsRoute, (context) => controller.queryActionMetrics(context) as never);
  app.openapi(refreshRoute, (context) => controller.refreshV2(context) as never);
  app.openapi(cancelRefreshRoute, (context) => controller.cancelLatestRefresh(context) as never);
  app.openapi(latestRefreshStatusRoute, (context) => controller.refreshStatus(context) as never);
  app.openapi(refreshStatusRoute, (context) => controller.refreshStatusById(context) as never);
}

export { SCHEDULER_SECRET_HEADER } from "./analytics.controller";
