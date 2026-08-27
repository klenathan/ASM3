import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { AnalyticsService } from "../application/analytics.service";
import { createAnalyticsController } from "./analytics.controller";
import {
  analyticsPageSchema,
  errorSchema,
  queryAnalyticsQuerySchema,
  refreshResponseSchema,
} from "./analytics.schemas";

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
    202: {
      description: "Refresh accepted",
      content: { "application/json": { schema: refreshResponseSchema } },
    },
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
  const controller = createAnalyticsController(dependencies);
  app.openapi(queryMetricsRoute, (context) => controller.queryMetrics(context) as never);
  app.openapi(refreshRoute, (context) => controller.refresh(context) as never);
}