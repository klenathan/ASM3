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
  .openapi("MediaErrorResponse");

export const mediaAssetSchema = z
  .object({
    id: z.string().uuid(),
    objectKey: z.string(),
    purpose: z.enum(["thread_attachment", "avatar"]),
    contentType: z.string(),
    byteSize: z.number().int().positive(),
    checksum: z.string().nullable(),
    status: z.enum(["pending", "ready", "quarantined", "deleted"]),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    deletedAt: z.string().datetime().nullable(),
  })
  .openapi("MediaAsset");

export const mediaUploadSchema = mediaAssetSchema
  .extend({
    uploadUrl: z.string().url(),
    uploadUrlExpiresAt: z.string().datetime().nullable(),
  })
  .openapi("MediaUpload");

export const requestUploadSchema = z
  .object({
    purpose: z.enum(["thread_attachment", "avatar"]),
    contentType: z.string().min(1).max(100),
    byteSize: z.number().int().positive(),
  })
  .openapi("RequestMediaUpload");

export const completeUploadSchema = z
  .object({ checksum: z.string().min(1).max(128).optional() })
  .openapi("CompleteMediaUpload");

export const attachMediaSchema = z
  .object({
    threadId: z.string().uuid(),
    mediaIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .openapi("AttachMedia");

export const mediaAttachmentSchema = z
  .object({
    threadId: z.string().uuid(),
    mediaIds: z.array(z.string().uuid()),
  })
  .openapi("MediaAttachment");

export const mediaUrlSchema = z
  .object({
    mediaId: z.string().uuid(),
    url: z.string().url(),
  })
  .openapi("MediaUrl");
