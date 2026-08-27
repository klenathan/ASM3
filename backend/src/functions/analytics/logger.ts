import pino from "pino";

export const analyticsLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "rmit-society-analytics" },
  redact: {
    paths: ["apiKey", "secret", "authorization", "databaseUrl"],
    censor: "[REDACTED]",
  },
});
