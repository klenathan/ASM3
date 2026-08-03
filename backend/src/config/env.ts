import { z } from "zod";
import { ALLOWED_EMAIL_DOMAINS } from "./email-domains";

const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "postgres:" || protocol === "postgresql:";
      } catch {
        return false;
      }
    },
    { message: "must be a valid PostgreSQL connection URL" },
  );

const booleanString = z.enum(["true", "false"]);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: postgresUrl,
    DATABASE_SSL: booleanString
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    ALLOWED_EMAIL_DOMAINS: z
      .string()
      .default(ALLOWED_EMAIL_DOMAINS.join(","))
      .transform((value) =>
        value
          .split(",")
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean),
      ),
    AWS_REGION: z.string().trim().min(1).optional(),
    MEDIA_BUCKET: z.string().trim().min(3).max(63).optional(),
    THREAD_EVENTS_QUEUE_URL: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.startsWith("https://"), {
        message: "must be an HTTPS SQS queue URL",
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.AWS_REGION === undefined) !==
      (value.MEDIA_BUCKET === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["MEDIA_BUCKET"],
        message: "AWS_REGION and MEDIA_BUCKET must be configured together",
      });
    }
    if (
      value.THREAD_EVENTS_QUEUE_URL !== undefined &&
      value.AWS_REGION === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["THREAD_EVENTS_QUEUE_URL"],
        message:
          "AWS_REGION is required when THREAD_EVENTS_QUEUE_URL is configured",
      });
    }
    if (value.NODE_ENV === "production" && value.MEDIA_BUCKET === undefined) {
      context.addIssue({
        code: "custom",
        path: ["MEDIA_BUCKET"],
        message: "is required in production",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.THREAD_EVENTS_QUEUE_URL === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["THREAD_EVENTS_QUEUE_URL"],
        message: "is required in production",
      });
    }
  });

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly webOrigin: string;
  readonly logLevel:
    | "fatal"
    | "error"
    | "warn"
    | "info"
    | "debug"
    | "trace"
    | "silent";
  readonly databaseUrl: string;
  readonly databaseSsl: boolean;
  readonly databasePoolMax: number;
  readonly allowedEmailDomains: readonly string[];
  readonly awsRegion: string | null;
  readonly mediaBucket: string | null;
  readonly threadEventsQueueUrl: string | null;
}

export function loadConfig(
  source: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    host: result.data.HOST,
    port: result.data.PORT,
    webOrigin: result.data.WEB_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.DATABASE_URL,
    databaseSsl: result.data.DATABASE_SSL,
    databasePoolMax: result.data.DATABASE_POOL_MAX,
    allowedEmailDomains: result.data.ALLOWED_EMAIL_DOMAINS,
    awsRegion: result.data.AWS_REGION ?? null,
    mediaBucket: result.data.MEDIA_BUCKET ?? null,
    threadEventsQueueUrl: result.data.THREAD_EVENTS_QUEUE_URL ?? null,
  };
}
