import { z } from "@hono/zod-openapi";

const isoDate = z.string().datetime();

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi("PlatformErrorResponse");

export const platformConfigSchema = z
  .object({
    key: z.string(),
    value: z.string(),
    updatedAt: isoDate.nullable(),
  })
  .openapi("PlatformConfig");

export const platformConfigListSchema = z
  .object({
    items: z.array(platformConfigSchema),
  })
  .openapi("PlatformConfigList");

export const putPlatformConfigRequestSchema = z
  .object({
    value: z.string().trim().min(1),
  })
  .openapi("PutPlatformConfigRequest");

export const platformConfigKeyParams = z.object({
  key: z.enum(["allowed_email_domains"]),
});

export const platformHealthSchema = z
  .object({
    status: z.literal("ok"),
    database: z.enum(["ok", "degraded"]),
    uptimeSeconds: z.number().int().nonnegative(),
    serverTime: isoDate,
  })
  .openapi("PlatformHealth");
