import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";

import type { AppEnvironment } from "./app-types";
import type { IdentityRouteDependencies } from "./modules/identity";
import {
  registerIdentityRoutes,
  sessionPrincipalMiddleware,
} from "./modules/identity";
import type { SocietyRouteDependencies } from "./modules/societies";
import { registerSocietyRoutes } from "./modules/societies";
import type { DiscussionRouteDependencies } from "./modules/discussions";
import { registerDiscussionRoutes } from "./modules/discussions";
import type { ModerationRouteDependencies } from "./modules/moderation";
import { registerModerationRoutes } from "./modules/moderation";
import type { PlatformRouteDependencies } from "./modules/platform";
import { registerPlatformRoutes } from "./modules/platform";
import type { MediaRouteDependencies } from "./modules/media";
import { registerMediaRoutes } from "./modules/media";
import type { AuditRouteDependencies } from "./modules/audit";
import { registerAuditRoutes } from "./modules/audit";
import type { AnalyticsRouteDependencies } from "./modules/analytics";
import { registerAnalyticsRoutes } from "./modules/analytics";
import type { PlacesPort } from "./modules/places/application/places.port";
import { createPlacesController } from "./modules/places/presentation/places.controller";
import { registerPlacesRoutes } from "./modules/places/presentation/places.routes";
import type { AppConfig } from "./config/env";
import {
  OPENAPI_CONFIG,
  OPENAPI_PATH,
  OPENAPI_UI_PATH,
} from "./config/openapi";
import { SERVICE_NAME } from "./constants";
import { requestLogger } from "./middleware/request-logger";
import { registerHealthRoutes } from "./routes/health";
import { AppError } from "./shared/domain/errors";
import { mapError } from "./shared/presentation/error-mapping";

interface AppDependencies {
  readonly config: Pick<AppConfig, "webOrigin"> &
    Partial<Pick<AppConfig, "nodeEnv">>;
  readonly logger: Logger;
  readonly checkReadiness: () => Promise<void>;
  readonly identity?: IdentityRouteDependencies;
  readonly societies?: SocietyRouteDependencies;
  readonly discussions?: DiscussionRouteDependencies;
  readonly moderation?: ModerationRouteDependencies;
  readonly platform?: PlatformRouteDependencies;
  readonly media?: MediaRouteDependencies;
  readonly audit?: AuditRouteDependencies;
  readonly analytics?: AnalyticsRouteDependencies;
  readonly placesPort?: PlacesPort;
}

export function createApp(dependencies: AppDependencies) {
  const app = new OpenAPIHono<AppEnvironment>();

  app.use("*", requestId());
  app.use("*", async (context, next) => {
    context.set("logger", dependencies.logger);
    await next();
  });
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
      app.use("/api/v1/me", principalMiddleware);
      app.use("/api/v1/me/*", principalMiddleware);
    }
    registerSocietyRoutes(app, dependencies.societies);
  }

  if (dependencies.discussions !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/threads", principalMiddleware);
      app.use("/api/v1/threads/*", principalMiddleware);
      app.use("/api/v1/comments", principalMiddleware);
      app.use("/api/v1/comments/*", principalMiddleware);
      app.use("/api/v1/feed", principalMiddleware);
      app.use("/api/v1/feed/*", principalMiddleware);
      app.use("/api/v1/admin/analysis", principalMiddleware);
      app.use("/api/v1/admin/analysis/*", principalMiddleware);
      app.use("/api/v1/mod/societies", principalMiddleware);
      app.use("/api/v1/mod/societies/*", principalMiddleware);
      app.use("/api/v1/users", principalMiddleware);
      app.use("/api/v1/users/*", principalMiddleware);
    }
    registerDiscussionRoutes(app, dependencies.discussions);
  }

  if (dependencies.moderation !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/reports", principalMiddleware);
      app.use("/api/v1/reports/*", principalMiddleware);
      app.use("/api/v1/mod", principalMiddleware);
      app.use("/api/v1/mod/*", principalMiddleware);
      app.use("/api/v1/admin/reports", principalMiddleware);
      app.use("/api/v1/admin/reports/*", principalMiddleware);
    }
    registerModerationRoutes(app, dependencies.moderation);
  }

  if (dependencies.platform !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/admin/config", principalMiddleware);
      app.use("/api/v1/admin/config/*", principalMiddleware);
      app.use("/api/v1/admin/health", principalMiddleware);
    }
    registerPlatformRoutes(app, dependencies.platform);
  }

  if (dependencies.media !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/media", principalMiddleware);
      app.use("/api/v1/media/*", principalMiddleware);
    }
    registerMediaRoutes(app, dependencies.media);
  }

  if (dependencies.audit !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/admin/audit", principalMiddleware);
      app.use("/api/v1/admin/audit/*", principalMiddleware);
    }
    registerAuditRoutes(app, dependencies.audit);
  }

  if (dependencies.analytics !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v2/admin/analytics", principalMiddleware);
      app.use("/api/v2/admin/analytics/*", principalMiddleware);
    }
    registerAnalyticsRoutes(app, dependencies.analytics);
  }

  if (dependencies.placesPort !== undefined) {
    if (dependencies.identity !== undefined) {
      const principalMiddleware = sessionPrincipalMiddleware({
        authService: dependencies.identity.authService,
      });
      app.use("/api/v1/places", principalMiddleware);
      app.use("/api/v1/places/*", principalMiddleware);
    }
    const controller = createPlacesController({ placesPort: dependencies.placesPort });
    registerPlacesRoutes(app, controller);
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
          details: {},
        },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    const isHttpError = error instanceof HTTPException;

    if (error instanceof AppError) {
      const mapped = mapError(error, context.get("requestId"));
      if (mapped.status >= 500) {
        dependencies.logger.error(
          { err: error, requestId: context.get("requestId") },
          "request failed",
        );
      }
      return context.json(mapped.body, mapped.status as never);
    }

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
          code: isHttpError ? "REQUEST_ERROR" : "INTERNAL_ERROR",
          message: isHttpError ? error.message : "Unexpected server error",
          requestId: context.get("requestId"),
          details: {},
        },
      },
      status,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
export { SERVICE_NAME };
