import { z } from "@hono/zod-openapi";

// Transport schemas only. Business rules live in the service.
export const threadAnalysisStatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["analyzing", "published", "needs_review", "unavailable"]),
  summary: z.string().optional(),
});

export const reportAnalysisSchema = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(["allow", "review"]).nullable(),
  sentiment: z.object({
    label: z.enum(["positive", "neutral", "negative", "mixed"]),
    confidence: z.number().min(0).max(1),
  }).nullable(),
  findings: z.array(z.object({
    category: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1),
    source: z.enum(["title", "body", "image", "comment"]),
    sourceId: z.string().optional(),
    evidence: z.string(),
  })),
  modelId: z.string().nullable(),
  promptVersion: z.string().nullable(),
  contextCapturedAt: z.string().nullable(),
  contextTruncated: z.boolean(),
});
