import { afterEach, describe, expect, it, vi } from "vitest";

import { createSocietyThread, createSocietyThreadFromDraft } from "./api";
import type { Thread } from "./types";

const thread: Thread = {
  id: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  authorId: "33333333-3333-4333-8333-333333333333",
  title: "Study group this Friday",
  body: "Meet outside Building 80 at 4 pm.",
  status: "published",
  score: 0,
  commentCount: 0,
  mediaIds: [],
  authorDisplayName: "Alex Student",
  authorAvatarMediaId: null,
  myVote: 0,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  deletedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("society posting API", () => {
  it("posts a new thread to the selected society", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(thread), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSocietyThread("cloud-club", {
        title: thread.title,
        body: thread.body ?? "",
      }),
    ).resolves.toEqual(thread);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/societies/cloud-club/threads");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      title: thread.title,
      body: thread.body,
    });
  });

  it("uploads selected images to S3, completes them, then attaches them to the thread", async () => {
    const mediaId = "44444444-4444-4444-8444-444444444444";
    const upload = {
      id: mediaId,
      objectKey: `media/thread_attachment/${mediaId}`,
      purpose: "thread_attachment",
      contentType: "image/png",
      byteSize: 5,
      checksum: null,
      status: "pending",
      createdAt: "2026-08-02T00:00:00.000Z",
      completedAt: null,
      deletedAt: null,
      uploadUrl: "https://bucket.s3.amazonaws.com/signed-upload",
      uploadUrlExpiresAt: "2026-08-02T00:05:00.000Z",
    };
    const ready = { ...upload, status: "ready", completedAt: "2026-08-02T00:00:01.000Z" };
    const threadWithMedia = { ...thread, mediaIds: [mediaId] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(upload), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ready), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(threadWithMedia), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = new File(["image"], "campus.png", { type: "image/png" });

    await expect(createSocietyThreadFromDraft("cloud-club", {
      title: thread.title,
      body: thread.body ?? "",
      images: [image],
    })).resolves.toEqual(threadWithMedia);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toBe(upload.uploadUrl);
    expect(uploadInit).toMatchObject({
      method: "PUT",
      body: image,
      headers: { "Content-Type": "image/png" },
    });
    const [, threadInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(JSON.parse(String(threadInit.body))).toEqual({
      title: thread.title,
      body: thread.body,
      mediaIds: [mediaId],
    });
  });

  it("deletes completed uploads when thread creation fails", async () => {
    const mediaId = "44444444-4444-4444-8444-444444444444";
    const upload = {
      id: mediaId,
      objectKey: `media/thread_attachment/${mediaId}`,
      purpose: "thread_attachment",
      contentType: "image/png",
      byteSize: 5,
      checksum: null,
      status: "pending",
      createdAt: "2026-08-02T00:00:00.000Z",
      completedAt: null,
      deletedAt: null,
      uploadUrl: "https://bucket.s3.amazonaws.com/signed-upload",
      uploadUrlExpiresAt: "2026-08-02T00:05:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(upload), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...upload, status: "ready" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "CONFLICT", message: "Thread could not be created" },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSocietyThreadFromDraft("cloud-club", {
      title: thread.title,
      body: thread.body ?? "",
      images: [new File(["image"], "campus.png", { type: "image/png" })],
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [cleanupUrl, cleanupInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    expect(cleanupUrl).toContain(`/api/v1/media/uploads/${mediaId}`);
    expect(cleanupInit.method).toBe("DELETE");
  });
});
