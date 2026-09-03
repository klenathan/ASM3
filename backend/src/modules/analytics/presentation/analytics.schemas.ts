import { z } from "@hono/zod-openapi";

const isoDate = z.string().datetime();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi("AnalyticsErrorResponse");

export const refreshResponseSchema = z
  .object({
    accepted: z.boolean(),
    message: z.string(),
    runId: z.string().uuid().optional(),
    status: z.enum(["requested", "exporting", "querying", "completed", "failed", "cancelled"]).optional(),
    coalesced: z.boolean().optional(),
    periodStart: calendarDate.optional(),
    periodEnd: calendarDate.optional(),
    warnings: z.array(z.string()).optional(),
  })
  .openapi("AnalyticsRefreshResponse");

export const refreshStatusSchema = z
  .object({
    runId: z.string().uuid(),
    trigger: z.enum(["admin", "nightly"]),
    status: z.enum(["requested", "exporting", "querying", "completed", "failed", "cancelled"]),
    attempts: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    periodStart: calendarDate.optional(),
    periodEnd: calendarDate.optional(),
  })
  .openapi("AnalyticsRefreshStatus");

export const refreshCancellationResponseSchema = z
  .object({
    cancelled: z.boolean(),
    message: z.string(),
    runId: z.string().uuid().optional(),
    status: z.enum(["requested", "exporting", "querying", "completed", "failed", "cancelled"]).optional(),
  })
  .openapi("AnalyticsRefreshCancellationResponse");

export const actionAnalyticsQuerySchema = z.object({
  grain: z.enum(["platform", "society", "content"]).optional(),
  society_id: z.string().uuid().optional(),
  target_type: z.enum(["thread", "comment"]).optional(),
  target_id: z.string().uuid().optional(),
  period_start: calendarDate.optional(),
  period_end: calendarDate.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const actionMetricSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("action_events"),
  metricKind: z.enum(["activity", "current_state", "reconciliation"]),
  grain: z.enum(["platform", "society", "content"]),
  societyId: z.string().uuid().nullable(),
  targetType: z.enum(["thread", "comment"]).nullable(),
  targetId: z.string().uuid().nullable(),
  threadId: z.string().uuid().nullable(),
  periodStart: isoDate,
  periodEnd: isoDate,
  snapshotAt: isoDate.nullable(),
  data: z.record(z.string(), z.unknown()),
});

export const actionAnalyticsPageSchema = z.object({
  contractVersion: z.literal(2),
  recordingStartedAt: isoDate,
  metrics: z.array(actionMetricSchema),
  page: z.object({ cursor: z.string().nullable(), hasMore: z.boolean() }),
});

export const refreshRangeSchema = z.object({
  periodStart: calendarDate,
  periodEnd: calendarDate,
});