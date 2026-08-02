import type { MiddlewareHandler } from "hono";
import type { Logger } from "pino";

import type { AppEnvironment } from "../app-types";

export function requestLogger(logger: Logger): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const startedAt = performance.now();
    context.set("logger", logger);

    try {
      await next();
    } finally {
      logger.info(
        {
          request: {
            id: context.get("requestId"),
            method: context.req.method,
            path: new URL(context.req.url).pathname,
          },
          response: {
            status: context.res.status,
          },
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
        },
        "request completed",
      );
    }
  };
}
