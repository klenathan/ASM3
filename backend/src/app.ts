import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";

import type { AppEnvironment } from "./app-types";
import type { IdentityRouteDependencies } from "./modules/identity/index";
import { registerIdentityRoutes, sessionPrincipalMiddleware } from "./modules/identity/index";
import type { SocietyRouteDependencies } from "./modules/societies/index";
import { registerSocietyRoutes } from "./modules/societies/index";
import type { AppConfig } from "./config/env";
import {
  OPENAPI_CONFIG,
  OPENAPI_PATH,
  OPENAPI_UI_PATH,
} from "./config/openapi";
import { SERVICE_NAME } from "./constants";
import { requestLogger } from "./middleware/request-logger";
import { registerHealthRoutes } from "./routes/health";

interface AppDependencies {
  readonly config: Pick<AppConfig, "webOrigin"> & Partial<Pick<AppConfig, "nodeEnv">>;
  readonly logger: Logger;
  readonly checkReadiness: () => Promise<void>;
  readonly identity?: IdentityRouteDependencies;
  readonly societies?: SocietyRouteDependencies;
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

  if (dependencies.identity !== undefined) {
    registerIdentityRoutes(app, {
      ...dependencies.identity,
      secureCookies: dependencies.config.nodeEnv === "production",
    });
  }

  if (dependencies.societies !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/societies", principalMiddleware);
      app.use("/api/v1/societies/*", principalMiddleware);
    }
    registerSocietyRoutes(app, dependencies.societies);
  }

  app.doc(OPENAPI_PATH, OPENAPI_CONFIG);
  app.get(OPENAPI_UI_PATH, swaggerUI({ url: OPENAPI_PATH }));

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
