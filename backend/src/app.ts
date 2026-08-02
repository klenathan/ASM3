import { OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";

import type { AppEnvironment } from "./app-types.js";
import type { AppConfig } from "./config/env.js";
import { API_VERSION, SERVICE_NAME } from "./constants.js";
import { requestLogger } from "./middleware/request-logger.js";
import { registerHealthRoutes } from "./routes/health.js";

interface AppDependencies {
  readonly config: Pick<AppConfig, "webOrigin">;
  readonly logger: Logger;
  readonly checkReadiness: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies) {
  const app = new OpenAPIHono<AppEnvironment>();

  app.use("*", requestId());
  app.use("*", requestLogger(dependencies.logger));
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: dependencies.config.webOrigin,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      credentials: true,
      maxAge: 600,
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (context) =>
        context.json(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "Request body exceeds 1 MiB limit",
              requestId: context.get("requestId"),
            },
          },
          413,
        ),
    }),
  );

  registerHealthRoutes(app, dependencies);

  app.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "RMIT Society API",
      version: API_VERSION,
      description: "Backend API for RMIT Society.",
    },
  });

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
          requestId: context.get("requestId"),
        },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    const isHttpError = error instanceof HTTPException;
    const status = isHttpError ? error.status : 500;

    dependencies.logger.error(
      {
        err: error,
        requestId: context.get("requestId"),
      },
      "request failed",
    );

    return context.json(
      {
        error: {
          code: isHttpError ? "REQUEST_ERROR" : "INTERNAL_SERVER_ERROR",
          message: isHttpError ? error.message : "Unexpected server error",
          requestId: context.get("requestId"),
        },
      },
      status,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
export { SERVICE_NAME };
