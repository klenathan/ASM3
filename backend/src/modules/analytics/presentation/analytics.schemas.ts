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

const metricTypeEnum = z.enum([
  "user_growth",
  "content_volume",
  "top_societies",
  "moderation",
]);

const userGrowthDataSchema = z.object({
  registrations: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
  suspensions: z.number().int().nonnegative(),
});

const contentVolumeDataSchema = z.object({
  threads: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  votes: z.number().int().nonnegative(),
  reports: z.number().int().nonnegative(),
});

const topSocietyEntrySchema = z.object({
  societyId: z.string().uuid(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
  threadCount: z.number().int().nonnegative(),
});

const topSocietiesDataSchema = z.object({
  topByMembers: z.array(topSocietyEntrySchema),
  topByThreads: z.array(topSocietyEntrySchema),
});

const moderationDataSchema = z.object({
  pendingReports: z.number().int().nonnegative(),
  resolvedToday: z.number().int().nonnegative(),
  avgResolutionHours: z.number().nonnegative(),
  totalReports: z.number().int().nonnegative(),
});

const metricPayloadSchema = z.union([
  userGrowthDataSchema,
  contentVolumeDataSchema,
  topSocietiesDataSchema,
  moderationDataSchema,
]);

export const analyticsMetricSchema = z
  .object({
    id: z.string().uuid(),
    metricType: metricTypeEnum,
    societyId: z.string().uuid().nullable(),
    periodStart: isoDate,
    periodEnd: isoDate,
    data: metricPayloadSchema,
  })
  .openapi("AnalyticsMetric");

export const analyticsPageSchema = z
  .object({
    metrics: z.array(analyticsMetricSchema),
    page: z.object({
      cursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  })
  .openapi("AnalyticsPage");

export const queryAnalyticsQuerySchema = z.object({
  metric_type: metricTypeEnum.optional(),
  society_id: z.string().uuid().optional(),
  period_start: isoDate.optional(),
  period_end: isoDate.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const refreshResponseSchema = z
  .object({
    accepted: z.boolean(),
    message: z.string(),
    runId: z.string().uuid().optional(),
    status: z.enum(["requested", "exporting", "querying", "completed", "failed"]).optional(),
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
    status: z.enum(["requested", "exporting", "querying", "completed", "failed"]),
    attempts: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    periodStart: calendarDate.optional(),
    periodEnd: calendarDate.optional(),
  })
  .openapi("AnalyticsRefreshStatus");

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

export const historicalBaselineSchema = z.object({
  source: z.literal("historical_baseline"),
  label: z.literal("Historical snapshot baseline — not reconstructed action history"),
  metrics: z.array(analyticsMetricSchema),
  page: z.object({ cursor: z.string().nullable(), hasMore: z.boolean() }),
});