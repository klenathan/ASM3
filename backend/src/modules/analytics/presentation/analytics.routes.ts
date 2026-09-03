import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { AnalyticsService } from "../application/analytics.service";
import {
  createAnalyticsController,
} from "./analytics.controller";
import {
  actionAnalyticsPageSchema,
  actionAnalyticsQuerySchema,
  analyticsPageSchema,
  errorSchema,
  historicalBaselineSchema,
  queryAnalyticsQuerySchema,
  refreshCancellationResponseSchema,
  refreshRangeSchema,
  refreshResponseSchema,
  refreshStatusSchema,
} from "./analytics.schemas";

const refreshStatusRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/analytics/refresh/status",
  tags: ["Analytics"],
  summary: "Get the latest analytics refresh status",
  responses: {
    200: {
      description: "Latest analytics refresh status",
      content: { "application/json": { schema: refreshStatusSchema.nullable() } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const queryMetricsRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/analytics",
  tags: ["Analytics"],
  summary: "Query analytics metrics",
  request: {
    query: queryAnalyticsQuerySchema,
  },
  responses: {
    200: {
      description: "Analytics metrics",
      content: { "application/json": { schema: analyticsPageSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Access denied", content: { "application/json": { schema: errorSchema } } },
  },
});

const refreshRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/analytics/refresh",
  tags: ["Analytics"],
  summary: "Trigger an on-demand analytics refresh",
  responses: {
    200: {
      description: "Refresh was not started",
      content: { "application/json": { schema: refreshResponseSchema } },
    },
    202: {
      description: "Refresh accepted",
      content: { "application/json": { schema: refreshResponseSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const scheduledRefreshRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/analytics/scheduled-refresh",
  tags: ["Analytics"],
  summary:
    "Internal nightly refresh entry point invoked by an EventBridge scheduled rule via an API destination; authenticated with a shared secret header",
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

const v2QueryMetricsRoute = createRoute({
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

const v2RefreshRoute = createRoute({
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
const v2CancelRefreshRoute = createRoute({
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
const v2LatestRefreshStatusRoute = createRoute({
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

const v2RefreshStatusRoute = createRoute({
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

const v2BaselineRoute = createRoute({
  method: "get",
  path: "/api/v2/admin/analytics/historical-baseline",
  tags: ["Analytics"],
  summary: "Read labelled legacy snapshot baseline",
  request: { query: queryAnalyticsQuerySchema },
  responses: {
    200: { description: "Historical baseline", content: { "application/json": { schema: historicalBaselineSchema } } },
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
  app.openapi(queryMetricsRoute, (context) => controller.queryMetrics(context) as never);
  app.openapi(refreshStatusRoute, (context) => controller.refreshStatus(context) as never);
  app.openapi(refreshRoute, (context) => controller.refresh(context) as never);
  app.openapi(scheduledRefreshRoute, (context) =>
    controller.scheduledRefresh(context) as never,
  );
  app.openapi(v2QueryMetricsRoute, (context) => controller.queryActionMetrics(context) as never);
  app.openapi(v2RefreshRoute, (context) => controller.refreshV2(context) as never);
  app.openapi(v2CancelRefreshRoute, (context) => controller.cancelLatestRefresh(context) as never);
  app.openapi(v2LatestRefreshStatusRoute, (context) => controller.refreshStatus(context) as never);
  app.openapi(v2RefreshStatusRoute, (context) => controller.refreshStatusById(context) as never);
  app.openapi(v2BaselineRoute, (context) => controller.historicalBaseline(context) as never);
}

export { SCHEDULER_SECRET_HEADER } from "./analytics.controller";
