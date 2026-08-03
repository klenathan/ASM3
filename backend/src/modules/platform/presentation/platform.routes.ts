import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { PlatformService } from "../application/platform.service";
import { createPlatformController } from "./platform.controller";
import {
  errorSchema,
  platformConfigKeyParams,
  platformConfigListSchema,
  platformConfigSchema,
  platformHealthSchema,
  putPlatformConfigRequestSchema,
} from "./platform.schemas";

const listConfigRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/config",
  tags: ["Platform administration"],
  summary: "List the configured platform settings",
  responses: {
    200: {
      description: "Platform settings",
      content: { "application/json": { schema: platformConfigListSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const putConfigRoute = createRoute({
  method: "put",
  path: "/api/v1/admin/config/{key}",
  tags: ["Platform administration"],
  summary: "Create or update a platform setting",
  request: {
    params: platformConfigKeyParams,
    body: { content: { "application/json": { schema: putPlatformConfigRequestSchema } } },
  },
  responses: {
    200: {
      description: "Saved platform setting",
      content: { "application/json": { schema: platformConfigSchema } },
    },
    400: { description: "Invalid setting value", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const healthRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/health",
  tags: ["Platform administration"],
  summary: "Read the platform health status",
  responses: {
    200: {
      description: "Platform health",
      content: { "application/json": { schema: platformHealthSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface PlatformRouteDependencies {
  readonly platformService: PlatformService;
}

export function registerPlatformRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: PlatformRouteDependencies,
): void {
  const controller = createPlatformController(dependencies);
  app.openapi(listConfigRoute, (context) => controller.listConfig(context) as never);
  app.openapi(putConfigRoute, (context) => controller.putConfig(context) as never);
  app.openapi(healthRoute, (context) => controller.health(context) as never);
}
