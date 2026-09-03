import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { MediaService } from "../application/media.service";
import { registerMediaRoutes } from "./media.routes";

const principal: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student",
};
const mediaId = "00000000-0000-4000-8000-000000000010";
const threadId = "00000000-0000-4000-8000-000000000011";

function makeApp() {
  const mediaService = {
    requestUpload: vi.fn(async () => ({ id: mediaId, status: "pending" })),
    requestUploadBatch: vi.fn(async () => [{ id: mediaId, status: "pending" }]),
    completeUpload: vi.fn(async () => ({ id: mediaId, status: "ready" })),
    completeUploadBatch: vi.fn(async () => ({ items: [{ mediaId, status: "ready" }] })),
    deleteUpload: vi.fn(async () => undefined),
    attachToThread: vi.fn(async () => ({ threadId, mediaIds: [mediaId] })),
    resolveMediaUrl: vi.fn(async () => ({ mediaId, url: "https://media.example.test/object", contentType: "image/png" })),
  };
  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerMediaRoutes(app, { mediaService: mediaService as unknown as MediaService });
  return { app, mediaService };
}

describe("media HTTP routes", () => {
  it("requests and completes an upload", async () => {
    const { app, mediaService } = makeApp();

    const requested = await app.request("/api/v1/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "avatar", contentType: "image/png", byteSize: 128 }),
    });
    expect(requested.status).toBe(201);
    expect(mediaService.requestUpload).toHaveBeenCalledWith(principal, {
      purpose: "avatar",
      contentType: "image/png",
      byteSize: 128,
    });

    const completed = await app.request(`/api/v1/media/uploads/${mediaId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checksum: "sha256:abc" }),
    });
    expect(completed.status).toBe(200);
    expect(mediaService.completeUpload).toHaveBeenCalledWith(principal, mediaId, {
      checksum: "sha256:abc",
    });
  });

  it("attaches media, resolves a URL, and deletes an upload", async () => {
    const { app, mediaService } = makeApp();

    const attached = await app.request("/api/v1/media/uploads/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, mediaIds: [mediaId] }),
    });
    expect(attached.status).toBe(200);
    expect(mediaService.attachToThread).toHaveBeenCalledWith(principal, { threadId, mediaIds: [mediaId] });

    const url = await app.request(`/api/v1/media/${mediaId}/url`);
    expect(url.status).toBe(200);
    expect(mediaService.resolveMediaUrl).toHaveBeenCalledWith(mediaId);

    const deleted = await app.request(`/api/v1/media/uploads/${mediaId}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(mediaService.deleteUpload).toHaveBeenCalledWith(principal, mediaId);
  });
});
