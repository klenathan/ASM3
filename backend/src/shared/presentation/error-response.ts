import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnvironment } from "../../app-types";
import { mapError } from "./error-mapping";

export type ErrorStatusByCode = Readonly<Record<string, ContentfulStatusCode>>;

export function errorResponse(
  context: Context<AppEnvironment>,
  error: unknown,
  statusByCode: ErrorStatusByCode = {},
): Response {
  const requestId = context.get("requestId");
  const mapped = mapError(error, requestId);
  const status = statusByCode[mapped.body.error.code] ?? mapped.status;

  if (status >= 500) {
    context.get("logger").error(
      {
        err: error,
        requestId,
      },
      "request failed",
    );
  }

  return context.json(mapped.body, status as ContentfulStatusCode);
}
