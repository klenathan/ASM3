import type { Database } from "../../db/client";
import { systemClock, type Clock } from "../../shared/application/clock";
import { CommentService } from "./application/comment.service";
import {
  FeedService,
} from "./application/feed.service";
import type { DiscussionProfilePort } from "./application/discussion.profile";
import type { ThreadEventPublisher } from "./application/thread-events.port";
import { NoopThreadEventPublisher } from "./application/thread-events.port";
import type { ThreadMediaPort } from "./application/thread-media.port";
import { ThreadService } from "./application/thread.service";import { VoteService } from "./application/vote.service";
import { DrizzleDiscussionRepository, DrizzleDiscussionTransactionManager } from "./infrastructure/drizzle-discussion.repository";
import type { MembershipRepository, SocietyRepository } from "../societies/index";

import type { AnalysisDecisionReader } from "./application/analysis-decision.reader";
import type { ThreadAnalysisDetailsReader } from "./application/analysis-details.reader";
import type { AnalysisModerationPort } from "./application/thread.service";

export interface DiscussionsModuleDependencies {
  readonly database: Database;
  readonly membershipRepository: MembershipRepository;
  readonly societyRepository: SocietyRepository;
  readonly profile: DiscussionProfilePort;
  readonly media: ThreadMediaPort;
  readonly events?: ThreadEventPublisher;
  readonly clock?: Clock;
  readonly onThreadCreated?: (threadId: string) => void;
  readonly analysisDecisionReader?: AnalysisDecisionReader;
  readonly threadAnalysisReader?: ThreadAnalysisDetailsReader;
  readonly analysisModeration?: AnalysisModerationPort;
  readonly placesPort?: import("../places/application/places.port").PlacesPort;
}

export function createDiscussionsModule(dependencies: DiscussionsModuleDependencies) {
  const repository = new DrizzleDiscussionRepository(dependencies.database);
  const transactions = new DrizzleDiscussionTransactionManager(dependencies.database);
  const clock = dependencies.clock ?? systemClock;
  const events = dependencies.events ?? new NoopThreadEventPublisher();
  const authorization = {
    membershipRepository: dependencies.membershipRepository,
    societyRepository: dependencies.societyRepository,
  };
  const threadService = new ThreadService({
    repository,
    transactions,
    clock,
    profile: dependencies.profile,
    media: dependencies.media,
    events,
    ...(dependencies.onThreadCreated !== undefined
      ? { onThreadCreated: dependencies.onThreadCreated }
      : {}),
    ...(dependencies.analysisDecisionReader !== undefined
      ? { analysisDecisionReader: dependencies.analysisDecisionReader }
      : {}),
    ...(dependencies.threadAnalysisReader !== undefined
      ? { threadAnalysisReader: dependencies.threadAnalysisReader }
      : {}),
    ...(dependencies.analysisModeration !== undefined
      ? { analysisModeration: dependencies.analysisModeration }
      : {}),
    ...(dependencies.placesPort !== undefined
      ? { placesPort: dependencies.placesPort }
      : {}),
    ...authorization,
  });
  const commentService = new CommentService({ repository, transactions, clock, ...authorization });
  const voteService = new VoteService({ repository, transactions, clock, ...authorization });
  const feedService = new FeedService({
    repository,
    profile: dependencies.profile,
    ...(dependencies.analysisDecisionReader !== undefined
      ? { analysisDecisionReader: dependencies.analysisDecisionReader }
      : {}),
    ...authorization,
  });

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
export type { AnalysisModerationPort } from "./application/thread.service";
export type { ThreadMediaPort } from "./application/thread-media.port";
export type { ThreadEventPublisher } from "./application/thread-events.port";
export {
  NoopThreadEventPublisher,
  buildThreadCreatedEvent,
} from "./application/thread-events.port";
export { SqsThreadEventPublisher } from "./infrastructure/thread-events.sqs.publisher";
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
  AnalysisQueueFilter,
  AnalysisQueueThreadDto,
  AnalysisQueuePageDto,
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
  AnalysisModerationAction,
} from "./application/discussion.dto";
