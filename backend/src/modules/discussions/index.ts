import type { Database } from "../../db/client";
import { systemClock, type Clock } from "../../shared/application/clock";
import { CommentService } from "./application/comment.service";
import {
  FeedService,
} from "./application/feed.service";
import type { DiscussionProfilePort } from "./application/discussion.profile";
import { ThreadService } from "./application/thread.service";
import { VoteService } from "./application/vote.service";
import { DrizzleDiscussionRepository, DrizzleDiscussionTransactionManager } from "./infrastructure/drizzle-discussion.repository";
import type { MembershipRepository, SocietyRepository } from "../societies/index";

export interface DiscussionsModuleDependencies {
  readonly database: Database;
  readonly membershipRepository: MembershipRepository;
  readonly societyRepository: SocietyRepository;
  readonly profile: DiscussionProfilePort;
  readonly clock?: Clock;
}

export function createDiscussionsModule(dependencies: DiscussionsModuleDependencies) {
  const repository = new DrizzleDiscussionRepository(dependencies.database);
  const transactions = new DrizzleDiscussionTransactionManager(dependencies.database);
  const clock = dependencies.clock ?? systemClock;
  const authorization = {
    membershipRepository: dependencies.membershipRepository,
    societyRepository: dependencies.societyRepository,
  };
  const threadService = new ThreadService({
    repository,
    transactions,
    clock,
    profile: dependencies.profile,
    ...authorization,
  });
  const commentService = new CommentService({ repository, transactions, clock, ...authorization });
  const voteService = new VoteService({ repository, transactions, clock, ...authorization });
  const feedService = new FeedService({ repository, profile: dependencies.profile, ...authorization });

  return {
    repository,
    transactions,
    threadService,
    commentService,
    voteService,
    feedService,
  };
}

export { CommentService } from "./application/comment.service";
export type { CommentServiceDependencies } from "./application/comment.service";
export { FeedService } from "./application/feed.service";
export type {
  DiscussionProfilePort,
} from "./application/discussion.profile";
export type {
  FeedServiceDependencies,
} from "./application/feed.service";
export { ThreadService } from "./application/thread.service";
export type { ThreadServiceDependencies } from "./application/thread.service";
export { VoteService } from "./application/vote.service";
export type { VoteServiceDependencies } from "./application/vote.service";
export {
  DrizzleDiscussionRepository,
  DrizzleDiscussionTransactionManager,
} from "./infrastructure/drizzle-discussion.repository";
export type { DiscussionRepository } from "./application/discussion.repository";
export { registerDiscussionRoutes, registerDiscussionsRoutes } from "./presentation/discussion.routes";
export type { DiscussionRouteDependencies } from "./presentation/discussion.routes";
export type {
  CommentDto,
  CommentPageDto,
  CreateCommentCommand,
  CreateThreadCommand,
  ThreadDto,
  ThreadPageDto,
  UpdateCommentCommand,
  UpdateThreadCommand,
  UserCommentActivityDto,
  UserCommentActivityPageDto,
  UserThreadActivityDto,
  UserThreadActivityPageDto,
  VoteCommand,
  VoteDto,
} from "./application/discussion.dto";
