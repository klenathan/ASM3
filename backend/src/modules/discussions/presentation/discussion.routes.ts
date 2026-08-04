import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { CommentService } from "../application/comment.service";
import type { FeedService } from "../application/feed.service";
import type { ThreadService } from "../application/thread.service";
import type { VoteService } from "../application/vote.service";
import { createDiscussionController } from "./discussion.controller";
import {
  analysisQueuePageSchema,
  analysisQueueQuerySchema,
  commentPageSchema,
  commentSchema,
  createCommentRequestSchema,
  createThreadRequestSchema,
  discussionPageQuerySchema,
  errorSchema,
  homeFeedPageSchema,
  threadPageSchema,
  threadSchema,
  threadAnalysisResponseSchema,
  updateCommentRequestSchema,
  updateThreadRequestSchema,
  userCommentActivityPageSchema,
  userThreadActivityPageSchema,
  voteRequestSchema,
  voteSchema,
} from "./discussion.schemas";

const societySlugParams = z.object({ societySlug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/) });
const threadIdParams = z.object({ threadId: z.string().uuid() });
const commentIdParams = z.object({ commentId: z.string().uuid() });
const publicUserIdParams = z.object({ userId: z.string().uuid() });

const listThreadsRoute = createRoute({
  method: "get",
  path: "/api/v1/societies/{societySlug}/threads",
  tags: ["Discussions"],
  summary: "List threads in a society",
  request: { params: societySlugParams, query: discussionPageQuerySchema },
  responses: {
    200: { description: "Thread feed", content: { "application/json": { schema: threadPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const homeFeedRoute = createRoute({
  method: "get",
  path: "/api/v1/feed",
  tags: ["Discussions"],
  summary: "List the authenticated user's home feed",
  description: "Threads from societies the user has joined, ordered by newest first.",
  request: { query: discussionPageQuerySchema },
  responses: {
    200: { description: "Home feed", content: { "application/json": { schema: homeFeedPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const createThreadRoute = createRoute({
  method: "post",
  path: "/api/v1/societies/{societySlug}/threads",
  tags: ["Discussions"],
  summary: "Create a thread",
  request: {
    params: societySlugParams,
    body: { content: { "application/json": { schema: createThreadRequestSchema } } },
  },
  responses: {
    201: { description: "Thread created", content: { "application/json": { schema: threadSchema } } },
    400: { description: "Invalid thread input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Active membership is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const getThreadRoute = createRoute({
  method: "get",
  path: "/api/v1/threads/{threadId}",
  tags: ["Discussions"],
  summary: "Get a thread",
  request: { params: threadIdParams },
  responses: {
    200: { description: "Thread", content: { "application/json": { schema: threadSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const threadAnalysisRoute = createRoute({
  method: "get",
  path: "/api/v1/threads/{threadId}/analysis",
  tags: ["Discussions"],
  summary: "Get full content-analysis details for a thread (moderator/system-admin)",
  request: { params: threadIdParams },
  responses: {
    200: { description: "Thread analysis details (null when none yet)", content: { "application/json": { schema: threadAnalysisResponseSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Moderator or system-admin access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const updateThreadRoute = createRoute({
  method: "patch",
  path: "/api/v1/threads/{threadId}",
  tags: ["Discussions"],
  summary: "Update a thread",
  request: {
    params: threadIdParams,
    body: { content: { "application/json": { schema: updateThreadRequestSchema } } },
  },
  responses: {
    200: { description: "Updated thread", content: { "application/json": { schema: threadSchema } } },
    400: { description: "Invalid thread input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Thread ownership or moderation access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteThreadRoute = createRoute({
  method: "delete",
  path: "/api/v1/threads/{threadId}",
  tags: ["Discussions"],
  summary: "Soft delete a thread",
  request: { params: threadIdParams },
  responses: {
    204: { description: "Thread deleted" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Thread ownership or moderation access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const listCommentsRoute = createRoute({
  method: "get",
  path: "/api/v1/threads/{threadId}/comments",
  tags: ["Discussions"],
  summary: "List comments for a thread",
  request: { params: threadIdParams, query: discussionPageQuerySchema },
  responses: {
    200: { description: "Comment feed", content: { "application/json": { schema: commentPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const createCommentRoute = createRoute({
  method: "post",
  path: "/api/v1/threads/{threadId}/comments",
  tags: ["Discussions"],
  summary: "Create a comment",
  request: {
    params: threadIdParams,
    body: { content: { "application/json": { schema: createCommentRequestSchema } } },
  },
  responses: {
    201: { description: "Comment created", content: { "application/json": { schema: commentSchema } } },
    400: { description: "Invalid comment input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Active membership is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Comment nesting limit exceeded", content: { "application/json": { schema: errorSchema } } },
  },
});

const voteThreadRoute = createRoute({
  method: "put",
  path: "/api/v1/threads/{threadId}/vote",
  tags: ["Discussions"],
  summary: "Set the current user's thread vote",
  request: {
    params: threadIdParams,
    body: { content: { "application/json": { schema: voteRequestSchema } } },
  },
  responses: {
    200: { description: "Thread vote", content: { "application/json": { schema: voteSchema } } },
    400: { description: "Invalid vote", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Active membership is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Thread was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const listUserThreadsRoute = createRoute({
  method: "get",
  path: "/api/v1/users/{userId}/threads",
  tags: ["Discussions"],
  summary: "List a user's threads",
  request: { params: publicUserIdParams, query: discussionPageQuerySchema },
  responses: {
    200: { description: "Thread activity", content: { "application/json": { schema: userThreadActivityPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Profile activity is private", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const listUserCommentsRoute = createRoute({
  method: "get",
  path: "/api/v1/users/{userId}/comments",
  tags: ["Discussions"],
  summary: "List a user's comments",
  request: { params: publicUserIdParams, query: discussionPageQuerySchema },
  responses: {
    200: { description: "Comment activity", content: { "application/json": { schema: userCommentActivityPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Profile activity is private", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const getCommentRoute = createRoute({
  method: "get",
  path: "/api/v1/comments/{commentId}",
  tags: ["Discussions"],
  summary: "Get a comment",
  request: { params: commentIdParams },
  responses: {
    200: { description: "Comment", content: { "application/json": { schema: commentSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Comment was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const updateCommentRoute = createRoute({
  method: "patch",
  path: "/api/v1/comments/{commentId}",
  tags: ["Discussions"],
  summary: "Update a comment",
  request: {
    params: commentIdParams,
    body: { content: { "application/json": { schema: updateCommentRequestSchema } } },
  },
  responses: {
    200: { description: "Updated comment", content: { "application/json": { schema: commentSchema } } },
    400: { description: "Invalid comment input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Comment ownership or moderation access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Comment was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteCommentRoute = createRoute({
  method: "delete",
  path: "/api/v1/comments/{commentId}",
  tags: ["Discussions"],
  summary: "Soft delete a comment",
  request: { params: commentIdParams },
  responses: {
    204: { description: "Comment deleted" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Comment ownership or moderation access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Comment was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const voteCommentRoute = createRoute({
  method: "put",
  path: "/api/v1/comments/{commentId}/vote",
  tags: ["Discussions"],
  summary: "Set the current user's comment vote",
  request: {
    params: commentIdParams,
    body: { content: { "application/json": { schema: voteRequestSchema } } },
  },
  responses: {
    200: { description: "Comment vote", content: { "application/json": { schema: voteSchema } } },
    400: { description: "Invalid vote", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Active membership is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Comment was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface DiscussionRouteDependencies {
  readonly threadService: ThreadService;
  readonly commentService: CommentService;
  readonly voteService: VoteService;
  readonly feedService: FeedService;
}

const listSocietyAnalysisQueueRoute = createRoute({
  method: "get",
  path: "/api/v1/mod/societies/{societySlug}/analysis",
  tags: ["Discussions"],
  summary: "List the content-analysis review queue for a society",
  request: { params: societySlugParams, query: analysisQueueQuerySchema },
  responses: {
    200: { description: "Society analysis queue", content: { "application/json": { schema: analysisQueuePageSchema } } },
    400: { description: "Invalid query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const listGlobalAnalysisQueueRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/analysis",
  tags: ["Discussions"],
  summary: "List the global content-analysis review queue across all societies",
  request: { query: analysisQueueQuerySchema },
  responses: {
    200: { description: "Global analysis queue", content: { "application/json": { schema: analysisQueuePageSchema } } },
    400: { description: "Invalid query", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

export function registerDiscussionRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: DiscussionRouteDependencies,
): void {
  const controller = createDiscussionController(dependencies);
  app.openapi(listThreadsRoute, (context) => controller.listThreads(context) as never);
  app.openapi(homeFeedRoute, (context) => controller.homeFeed(context) as never);
  app.openapi(createThreadRoute, (context) => controller.createThread(context) as never);
  app.openapi(getThreadRoute, (context) => controller.getThread(context) as never);
  app.openapi(threadAnalysisRoute, (context) => controller.getThreadAnalysis(context) as never);
  app.openapi(updateThreadRoute, (context) => controller.updateThread(context) as never);
  app.openapi(deleteThreadRoute, (context) => controller.deleteThread(context) as never);
  app.openapi(listCommentsRoute, (context) => controller.listComments(context) as never);
  app.openapi(createCommentRoute, (context) => controller.createComment(context) as never);
  app.openapi(voteThreadRoute, (context) => controller.voteThread(context) as never);
  app.openapi(listUserThreadsRoute, (context) => controller.listUserThreads(context) as never);
  app.openapi(listUserCommentsRoute, (context) => controller.listUserComments(context) as never);
  app.openapi(getCommentRoute, (context) => controller.getComment(context) as never);
  app.openapi(updateCommentRoute, (context) => controller.updateComment(context) as never);
  app.openapi(deleteCommentRoute, (context) => controller.deleteComment(context) as never);
  app.openapi(voteCommentRoute, (context) => controller.voteComment(context) as never);
  app.openapi(listSocietyAnalysisQueueRoute, (context) => controller.listSocietyAnalysisQueue(context) as never);
  app.openapi(listGlobalAnalysisQueueRoute, (context) => controller.listGlobalAnalysisQueue(context) as never);
}

export const registerDiscussionsRoutes = registerDiscussionRoutes;
