import { afterEach, describe, expect, it, vi } from "vitest";

import { createSocietyThread } from "./api";
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
});
