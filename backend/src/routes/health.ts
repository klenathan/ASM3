import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Logger } from "pino";

import type { AppEnvironment } from "../app-types.js";
import { SERVICE_NAME } from "../constants.js";

const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal(SERVICE_NAME),
    timestamp: z.string().datetime(),
  })
  .openapi("HealthResponse");

const readinessErrorSchema = z
  .object({
    status: z.literal("error"),
    service: z.literal(SERVICE_NAME),
    timestamp: z.string().datetime(),
  })
  .openapi("ReadinessErrorResponse");

const livenessRoute = createRoute({
  method: "get",
  path: "/api/v1/health/live",
  tags: ["Health"],
  summary: "Check whether the API process is running",
  responses: {
    200: {
      description: "API process is alive",
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
    },
  },
});

const readinessRoute = createRoute({
  method: "get",
  path: "/api/v1/health/ready",
  tags: ["Health"],
  summary: "Check whether the API can access required dependencies",
  responses: {
    200: {
      description: "API is ready to receive traffic",
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
    },
    503: {
      description: "A required dependency is unavailable",
      content: {
        "application/json": {
          schema: readinessErrorSchema,
        },
      },
    },
  },
});

interface HealthDependencies {
  readonly checkReadiness: () => Promise<void>;
  readonly logger: Logger;
}

function healthPayload() {
  return {
    status: "ok",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  } as const;
}

function readinessErrorPayload() {
  return {
    status: "error",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  } as const;
}

export function registerHealthRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: HealthDependencies,
): void {
  app.openapi(livenessRoute, (context) => context.json(healthPayload(), 200));

  app.openapi(readinessRoute, async (context) => {
    try {
      await dependencies.checkReadiness();
      return context.json(healthPayload(), 200);
    } catch (error) {
      dependencies.logger.warn(
        {
          err: error,
          requestId: context.get("requestId"),
        },
        "readiness check failed",
      );

      return context.json(readinessErrorPayload(), 503);
    }
  });
}
