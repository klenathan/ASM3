import { z } from "@hono/zod-openapi";

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi("DiscussionErrorResponse");

const isoDate = z.string().datetime();

export const threadSchema = z
  .object({
    id: z.string().uuid(),
    societyId: z.string().uuid(),
    authorId: z.string().uuid(),
    title: z.string(),
    body: z.string().nullable(),
    status: z.enum(["published", "removed", "deleted"]),
    score: z.number().int(),
    commentCount: z.number().int().nonnegative(),
    mediaIds: z.array(z.string().uuid()),
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: isoDate.nullable(),
  })
  .openapi("Thread");

export const threadPageSchema = z
  .object({
    items: z.array(threadSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("ThreadPage");

export const commentSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    authorId: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    body: z.string().nullable(),
    status: z.enum(["published", "removed", "deleted"]),
    score: z.number().int(),
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: isoDate.nullable(),
  })
  .openapi("Comment");

export const commentPageSchema = z
  .object({
    items: z.array(commentSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("CommentPage");

export const createThreadRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(100_000),
    mediaIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .openapi("CreateThreadRequest");

export const updateThreadRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().trim().min(1).max(100_000).optional(),
    mediaIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one thread field is required")
  .openapi("UpdateThreadRequest");

export const createCommentRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
    parentId: z.string().uuid().nullable().optional(),
  })
  .openapi("CreateCommentRequest");

export const updateCommentRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
  })
  .openapi("UpdateCommentRequest");

export const voteRequestSchema = z
  .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
  .openapi("VoteRequest");

export const voteSchema = z
  .object({
    targetType: z.enum(["thread", "comment"]),
    targetId: z.string().uuid(),
    value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    score: z.number().int(),
  })
  .openapi("Vote");

export const discussionPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .openapi("DiscussionPageQuery");
