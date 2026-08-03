import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { AuditTrailService } from "../application/audit-trail.service";
import { createAuditController } from "./audit.controller";
import {
  auditEventListSchema,
  auditPageQuerySchema,
  errorSchema,
} from "./audit.schemas";

const listEventsRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/audit",
  tags: ["Audit trail"],
  summary: "List the platform event/audit trail",
  request: {
    query: auditPageQuerySchema,
  },
  responses: {
    200: {
      description: "Audit event trail",
      content: { "application/json": { schema: auditEventListSchema } },
    },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface AuditRouteDependencies {
  readonly auditService: AuditTrailService;
}

export function registerAuditRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: AuditRouteDependencies,
): void {
  const controller = createAuditController(dependencies);
  app.openapi(listEventsRoute, (context) => controller.listEvents(context) as never);
}
