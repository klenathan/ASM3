import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { CommentService } from "../application/comment.service";
import type { FeedService } from "../application/feed.service";
import type { ThreadService } from "../application/thread.service";
import type { VoteService } from "../application/vote.service";
import { registerDiscussionRoutes } from "./discussion.routes";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student" as const,
};
const threadId = "00000000-0000-4000-8000-000000000011";
const commentId = "00000000-0000-4000-8000-000000000012";

function makeApp() {
  const threadService = {
    createThread: vi.fn(async () => ({ id: threadId, title: "Cloud" })),
    getThread: vi.fn(async () => ({ id: threadId, title: "Cloud" })),
    updateThread: vi.fn(async () => ({ id: threadId, title: "Updated" })),
    deleteThread: vi.fn(async () => undefined),
    getThreadAnalysis: vi.fn(async () => null),
    moderateAnalysis: vi.fn(async () => undefined),
  };
  const commentService = {
    createComment: vi.fn(async () => ({ id: commentId, threadId, body: "Helpful" })),
    getComment: vi.fn(async () => ({ id: commentId, threadId, body: "Helpful" })),
    updateComment: vi.fn(async () => ({ id: commentId, threadId, body: "Updated" })),
    deleteComment: vi.fn(async () => undefined),
  };
  const voteService = {
    voteThread: vi.fn(async () => ({ targetType: "thread", targetId: threadId, value: 1, score: 1 })),
    voteComment: vi.fn(async () => ({ targetType: "comment", targetId: commentId, value: -1, score: -1 })),
  };
  const feedService = {
    listSocietyThreads: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listHomeFeed: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listThreadComments: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listUserThreads: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listUserComments: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listSocietyAnalysisQueue: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listGlobalAnalysisQueue: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  };

  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerDiscussionRoutes(app, {
    threadService: threadService as unknown as ThreadService,
    commentService: commentService as unknown as CommentService,
    voteService: voteService as unknown as VoteService,
    feedService: feedService as unknown as FeedService,
  });
  return { app, threadService, commentService, voteService, feedService };
}

describe("discussion HTTP routes", () => {
  it("creates and reads a thread through the society feed", async () => {
    const { app, threadService, feedService } = makeApp();

    const created = await app.request("/api/v1/societies/cloud/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud", body: "How should we deploy?" }),
    });
    expect(created.status).toBe(201);
    expect(threadService.createThread).toHaveBeenCalledWith(
      principal,
      "cloud",
      { title: "Cloud", body: "How should we deploy?" },
    );

    const feed = await app.request("/api/v1/societies/cloud/threads?limit=5");
    expect(feed.status).toBe(200);
    await expect(feed.json()).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(feedService.listSocietyThreads).toHaveBeenCalledWith(principal, "cloud", { limit: 5 });
  });

  it("creates comments and sets thread and comment votes", async () => {
    const { app, commentService, voteService } = makeApp();

    const comment = await app.request(`/api/v1/threads/${threadId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Helpful" }),
    });
    expect(comment.status).toBe(201);
    expect(commentService.createComment).toHaveBeenCalledWith(
      principal,
      threadId,
      { body: "Helpful" },
    );

    const threadVote = await app.request(`/api/v1/threads/${threadId}/vote`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    expect(threadVote.status).toBe(200);
    expect(voteService.voteThread).toHaveBeenCalledWith(principal, threadId, 1);

    const commentVote = await app.request(`/api/v1/comments/${commentId}/vote`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: -1 }),
    });
    expect(commentVote.status).toBe(200);
    expect(voteService.voteComment).toHaveBeenCalledWith(principal, commentId, -1);
  });

  it("soft-deletes a thread and rejects invalid request bodies", async () => {
    const { app, threadService } = makeApp();

    const deleted = await app.request(`/api/v1/threads/${threadId}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(threadService.deleteThread).toHaveBeenCalledWith(principal, threadId);

    const invalid = await app.request("/api/v1/societies/cloud/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(invalid.status).toBe(400);
    expect(threadService.createThread).not.toHaveBeenCalled();
  });
});

