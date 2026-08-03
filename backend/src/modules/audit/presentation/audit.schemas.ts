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
  .openapi("AuditErrorResponse");

export const auditEventSchema = z
  .object({
    id: z.string().uuid(),
    sourceEventId: z.string().uuid(),
    eventType: z.string(),
    version: z.number().int(),
    threadId: z.string().uuid().nullable(),
    societyId: z.string().uuid().nullable(),
    authorId: z.string().uuid().nullable(),
    title: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    receivedAt: isoDate,
    processingStatus: z.string(),
  })
  .openapi("AuditEvent");

export const auditEventListSchema = z
  .object({
    items: z.array(auditEventSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("AuditEventList");

export const auditPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .openapi("AuditPageQuery");

