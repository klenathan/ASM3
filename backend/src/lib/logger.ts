import pino, { type Logger } from "pino";

import type { AppConfig } from "../config/env.js";
import { SERVICE_NAME } from "../constants.js";

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.logLevel,
    base: {
      service: SERVICE_NAME,
      environment: config.nodeEnv,
    },
    redact: {
      paths: [
        "authorization",
        "cookie",
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  });
}
