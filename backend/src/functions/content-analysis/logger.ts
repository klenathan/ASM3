/**
 * Shared pino logger for the content-analysis Lambda. Kept separate from the
 * backend's app logger so the self-contained Lambda bundle does not pull in
 * AppConfig/constants from outside the function directory.
 */
import pino, { type Logger } from "pino";

export type { Logger } from "pino";

export function createLambdaLogger(env: Record<string, string | undefined>): Logger {
  return pino({
    level: env.LOG_LEVEL ?? "info",
    base: { service: "rmit-society-content-analysis" },
    redact: {
      paths: ["apiKey", "secret", "authorization"],
      censor: "[REDACTED]",
    },
  });
}
