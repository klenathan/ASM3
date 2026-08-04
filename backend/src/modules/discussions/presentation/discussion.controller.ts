import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { PageRequest } from "../../../shared/application/pagination";
import type {
  CreateCommentCommand,
  CreateThreadCommand,
  UpdateCommentCommand,
  UpdateThreadCommand,
  VoteCommand,
  AnalysisModerationAction,
} from "../application/discussion.dto";
import type { CommentService } from "../application/comment.service";
import type { FeedService } from "../application/feed.service";
import type { ThreadService } from "../application/thread.service";
import type { VoteService } from "../application/vote.service";
import {
  discussionErrorResponse,
  requireInjectedPrincipal,
  validated,
} from "./discussion.http.helpers";

export interface DiscussionControllerDependencies {
  readonly threadService: ThreadService;
  readonly commentService: CommentService;
  readonly voteService: VoteService;
  readonly feedService: FeedService;
}

interface SocietyPathParams {
  readonly societySlug: string;
}

interface ThreadPathParams {
  readonly threadId: string;
}

interface CommentPathParams {
  readonly commentId: string;
}

interface PageQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

interface AnalysisQueueQuery extends PageQuery {
  readonly status?: "all" | "none" | "review";
}

interface AnalysisModerationBody {
  readonly decision: "accept" | "reject";
  readonly reason?: string;
}

interface SocietyThreadPathParams {
  readonly societySlug: string;
  readonly threadId: string;
}

interface PublicUserIdParams {
  readonly userId: string;
}

export function createDiscussionController(dependencies: DiscussionControllerDependencies) {
  return {
    async listThreads(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.feedService.listSocietyThreads(
          requireInjectedPrincipal(context),
          societySlug,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async homeFeed(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const result = await dependencies.feedService.listHomeFeed(
          requireInjectedPrincipal(context),
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async listSocietyAnalysisQueue(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const query = validated<AnalysisQueueQuery>(context, "query");
        const result = await dependencies.feedService.listSocietyAnalysisQueue(
          requireInjectedPrincipal(context),
          societySlug,
          pageFrom(query),
          query.status,
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async listGlobalAnalysisQueue(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const query = validated<AnalysisQueueQuery>(context, "query");
        const result = await dependencies.feedService.listGlobalAnalysisQueue(
          requireInjectedPrincipal(context),
          pageFrom(query),
          query.status,
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async overrideGlobalAnalysis(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const body = validated<AnalysisModerationBody>(context, "json");
        const action: AnalysisModerationAction =
          body.reason === undefined
            ? { kind: body.decision }
            : { kind: body.decision, reason: body.reason };
        await dependencies.threadService.moderateAnalysis(
          requireInjectedPrincipal(context),
          threadId,
          action,
        );
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async reanalyzeGlobalAnalysis(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { threadId } = validated<ThreadPathParams>(context, "param");
        await dependencies.threadService.moderateAnalysis(
          requireInjectedPrincipal(context),
          threadId,
          { kind: "reanalyze" },
        );
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async overrideSocietyAnalysis(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societySlug, threadId } = validated<SocietyThreadPathParams>(context, "param");
        const body = validated<AnalysisModerationBody>(context, "json");
        const action: AnalysisModerationAction =
          body.reason === undefined
            ? { kind: body.decision }
            : { kind: body.decision, reason: body.reason };
        await dependencies.threadService.moderateAnalysis(
          requireInjectedPrincipal(context),
          threadId,
          action,
          societySlug,
        );
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async reanalyzeSocietyAnalysis(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societySlug, threadId } = validated<SocietyThreadPathParams>(context, "param");
        await dependencies.threadService.moderateAnalysis(
          requireInjectedPrincipal(context),
          threadId,
          { kind: "reanalyze" },
          societySlug,
        );
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async createThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const command = validated<CreateThreadCommand>(context, "json");
        const result = await dependencies.threadService.createThread(principal, societySlug, command);
        return context.json(result, 201);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async getThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const result = await dependencies.threadService.getThread(
          requireInjectedPrincipal(context),
          threadId,
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async getThreadAnalysis(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const result = await dependencies.threadService.getThreadAnalysis(
          requireInjectedPrincipal(context),
          threadId,
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async updateThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const command = validated<UpdateThreadCommand>(context, "json");
        const result = await dependencies.threadService.updateThread(principal, threadId, command);
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async deleteThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { threadId } = validated<ThreadPathParams>(context, "param");
        await dependencies.threadService.deleteThread(principal, threadId);
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async listComments(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const result = await dependencies.feedService.listThreadComments(
          requireInjectedPrincipal(context),
          threadId,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async createComment(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const command = validated<CreateCommentCommand>(context, "json");
        const result = await dependencies.commentService.createComment(principal, threadId, command);
        return context.json(result, 201);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async listUserThreads(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { userId } = validated<PublicUserIdParams>(context, "param");
        const result = await dependencies.feedService.listUserThreads(
          requireInjectedPrincipal(context),
          userId,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async listUserComments(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { userId } = validated<PublicUserIdParams>(context, "param");
        const result = await dependencies.feedService.listUserComments(
          requireInjectedPrincipal(context),
          userId,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async voteThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { threadId } = validated<ThreadPathParams>(context, "param");
        const { value } = validated<VoteCommand>(context, "json");
        const result = await dependencies.voteService.voteThread(principal, threadId, value);
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async getComment(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { commentId } = validated<CommentPathParams>(context, "param");
        const result = await dependencies.commentService.getComment(
          requireInjectedPrincipal(context),
          commentId,
        );
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async updateComment(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { commentId } = validated<CommentPathParams>(context, "param");
        const command = validated<UpdateCommentCommand>(context, "json");
        const result = await dependencies.commentService.updateComment(principal, commentId, command);
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async deleteComment(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { commentId } = validated<CommentPathParams>(context, "param");
        await dependencies.commentService.deleteComment(principal, commentId);
        return context.body(null, 204);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },

    async voteComment(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { commentId } = validated<CommentPathParams>(context, "param");
        const { value } = validated<VoteCommand>(context, "json");
        const result = await dependencies.voteService.voteComment(principal, commentId, value);
        return context.json(result, 200);
      } catch (error) {
        return discussionErrorResponse(context, error);
      }
    },
  };
}

function pageFrom(query: PageQuery): PageRequest {
  return query.cursor === undefined
    ? { limit: query.limit ?? 20 }
    : { limit: query.limit ?? 20, cursor: query.cursor };
}
