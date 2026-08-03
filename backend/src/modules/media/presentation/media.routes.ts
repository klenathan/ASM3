import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { MediaService } from "../application/media.service";
import { createMediaController } from "./media.controller";
import {
  attachMediaSchema,
  completeUploadBatchSchema,
  completeUploadSchema,
  errorSchema,
  mediaAssetSchema,
  mediaAttachmentSchema,
  mediaBatchResultSchema,
  mediaUploadBatchSchema,
  mediaUploadSchema,
  mediaUrlSchema,
  requestUploadBatchSchema,
  requestUploadSchema,
} from "./media.schemas";

const mediaParams = z.object({ mediaId: z.string().uuid() });

const requestUploadRoute = createRoute({
  method: "post",
  path: "/api/v1/media/uploads",
  tags: ["Media"],
  summary: "Request a direct media upload",
  request: { body: { content: { "application/json": { schema: requestUploadSchema } } } },
  responses: {
    201: { description: "Upload instructions", content: { "application/json": { schema: mediaUploadSchema } } },
    400: { description: "Invalid upload request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const completeUploadRoute = createRoute({
  method: "post",
  path: "/api/v1/media/uploads/{mediaId}/complete",
  tags: ["Media"],
  summary: "Complete and verify a direct media upload",
  request: {
    params: mediaParams,
    body: { content: { "application/json": { schema: completeUploadSchema } } },
  },
  responses: {
    200: { description: "Ready media asset", content: { "application/json": { schema: mediaAssetSchema } } },
    400: { description: "Upload metadata did not match", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Media asset was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const requestUploadBatchRoute = createRoute({
  method: "post",
  path: "/api/v1/media/uploads/batch",
  tags: ["Media"],
  summary: "Request direct uploads for a manifest of media files",
  request: {
    body: { content: { "application/json": { schema: requestUploadBatchSchema } } },
  },
  responses: {
    201: { description: "One upload instruction per manifest file", content: { "application/json": { schema: mediaUploadBatchSchema } } },
    400: { description: "Invalid upload manifest", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const completeUploadBatchRoute = createRoute({
  method: "post",
  path: "/api/v1/media/uploads/complete-batch",
  tags: ["Media"],
  summary: "Verify a batch of direct uploads and mark them ready",
  request: {
    body: { content: { "application/json": { schema: completeUploadBatchSchema } } },
  },
  responses: {
    200: { description: "Per-upload verification result", content: { "application/json": { schema: mediaBatchResultSchema } } },
    400: { description: "Invalid completion batch", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteUploadRoute = createRoute({
  method: "delete",
  path: "/api/v1/media/uploads/{mediaId}",
  tags: ["Media"],
  summary: "Delete a media upload",
  request: { params: mediaParams },
  responses: {
    204: { description: "Media upload deleted" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Media asset was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const getMediaUrlRoute = createRoute({
  method: "get",
  path: "/api/v1/media/{mediaId}/url",
  tags: ["Media"],
  summary: "Resolve a ready media asset to a signed object URL",
  request: { params: mediaParams },
  responses: {
    200: { description: "Signed media object URL", content: { "application/json": { schema: mediaUrlSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Media asset was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const attachToThreadRoute = createRoute({
  method: "post",
  path: "/api/v1/media/uploads/attach",
  tags: ["Media"],
  summary: "Attach ready uploads to a thread",
  request: { body: { content: { "application/json": { schema: attachMediaSchema } } } },
  responses: {
    200: { description: "Thread media attachment", content: { "application/json": { schema: mediaAttachmentSchema } } },
    400: { description: "Invalid attachment", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Media ownership is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread or media asset was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface MediaRouteDependencies {
  readonly mediaService: MediaService;
}

export function registerMediaRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: MediaRouteDependencies,
): void {
  const controller = createMediaController(dependencies);
  app.openapi(requestUploadRoute, (context) => controller.requestUpload(context) as never);
  app.openapi(completeUploadRoute, (context) => controller.completeUpload(context) as never);
  app.openapi(requestUploadBatchRoute, (context) => controller.requestUploadBatch(context) as never);
  app.openapi(completeUploadBatchRoute, (context) => controller.completeUploadBatch(context) as never);
  app.openapi(deleteUploadRoute, (context) => controller.deleteUpload(context) as never);
  app.openapi(attachToThreadRoute, (context) => controller.attachToThread(context) as never);
  app.openapi(getMediaUrlRoute, (context) => controller.getMediaUrl(context) as never);
}
