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
  .openapi("ModerationErrorResponse");

export const reportSchema = z
  .object({
    id: z.string().uuid(),
    societyId: z.string().uuid(),
    reporterId: z.string().uuid(),
    threadId: z.string().uuid().nullable(),
    commentId: z.string().uuid().nullable(),
    targetType: z.enum(["thread", "comment"]),
    targetId: z.string().uuid(),
    reason: z.string(),
    details: z.string().nullable(),
    status: z.enum(["pending", "in_review", "resolved", "dismissed"]),
    assignedTo: z.string().uuid().nullable(),
    resolution: z.string().nullable(),
    resolutionNote: z.string().nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    resolvedAt: isoDate.nullable(),
    resolvedBy: z.string().uuid().nullable(),
  })
  .openapi("Report");

export const reportPageSchema = z
  .object({
    items: z.array(reportSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("ReportPage");

export const createReportRequestSchema = z
  .object({
    societyId: z.string().uuid(),
    threadId: z.string().uuid().optional(),
    commentId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(200),
    details: z.string().trim().min(1).max(1_000).optional(),
  })
  .refine((value) => (value.threadId === undefined) !== (value.commentId === undefined), {
    message: "Exactly one of threadId or commentId is required",
  })
  .openapi("CreateReportRequest");

export const resolveReportRequestSchema = z
  .object({
    action: z.enum(["remove_content", "ban_member", "suspend_user"]),
    resolutionNote: z.string().trim().min(1).max(1_000).optional(),
    suspendedUntil: isoDate.nullable().optional(),
  })
  .openapi("ResolveReportRequest");

export const dismissReportRequestSchema = z
  .object({
    resolutionNote: z.string().trim().min(1).max(1_000).optional(),
  })
  .openapi("DismissReportRequest");

export const moderationDecisionRequestSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    action: z.enum(["remove_content", "ban_member", "suspend_user"]).optional(),
    resolutionNote: z.string().trim().min(1).max(1_000).optional(),
    suspendedUntil: isoDate.nullable().optional(),
  })
  .refine((value) => value.status === "dismissed" || value.action !== undefined, {
    message: "A resolution action is required when resolving a report",
  })
  .openapi("ModerationDecisionRequest");

export const moderationPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .openapi("ModerationPageQuery");
