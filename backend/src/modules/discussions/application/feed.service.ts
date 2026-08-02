import type { PageRequest } from "../../../shared/application/pagination";
import { normalizePageSize } from "../../../shared/application/pagination";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { SocietyRecord } from "../../societies/domain/society";
import type { ThreadRecord } from "../domain/discussion";
import type { ThreadMediaRecord } from "./discussion.repository";
import type { DiscussionProfilePort } from "./discussion.profile";
import {
  canReadRetained,
  hasSocietyModeratorAuthority,
  requireSocietyBySlug,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization";
import type {
  CommentPageDto,
  HomeFeedPageDto,
  ThreadPageDto,
  UserCommentActivityDto,
  UserCommentActivityPageDto,
  UserThreadActivityDto,
  UserThreadActivityPageDto,
} from "./discussion.dto";
import {
  toCommentPageDto,
  toHomeFeedThreadDto,
  toThreadPageDto,
  toUserCommentActivityDto,
  toUserThreadActivityDto,
  type ProfileIdentity,
} from "./discussion.mappers";
import type { DiscussionRepository } from "./discussion.repository";

export interface FeedServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
  readonly profile: DiscussionProfilePort;
}

export class FeedService {
  private readonly repository: DiscussionRepository;
  private readonly authorization: DiscussionAuthorizationDependencies;
  private readonly profile: DiscussionProfilePort;

  constructor(dependencies: FeedServiceDependencies) {
    this.repository = dependencies.repository;
    this.authorization = dependencies;
    this.profile = dependencies.profile;
  }

  async listSocietyThreads(
    principal: RequestPrincipal | undefined,
    slug: string,
    page: PageRequest,
  ): Promise<ThreadPageDto> {
    const society = await requireSocietyBySlug(this.authorization, slug);
    const societyId = society.id;
    const includeRetained = principal === undefined
      ? false
      : await hasSocietyModeratorAuthority(this.authorization, principal, societyId);
    const normalizedPage = normalizePage(page);
    const result = await this.repository.listThreads(societyId, normalizedPage, includeRetained);
    const mediaByThread = await this.mediaByThread(result.items);
    const authorById = await this.identitiesFor(result.items);
    const voteByThread = new Map<string, -1 | 0 | 1>();
    if (principal !== undefined) {
      const votes = await this.repository.findThreadVotes(
        result.items.map((thread) => thread.id),
        principal.userId,
      );
      for (const vote of votes) voteByThread.set(vote.threadId, vote.value);
    }
    return toThreadPageDto(result, mediaByThread, authorById, voteByThread);
  }

  async listThreadComments(
    principal: RequestPrincipal | undefined,
    threadId: string,
    page: PageRequest,
  ): Promise<CommentPageDto> {
    const thread = await this.repository.findThread(threadId);
    if (thread === null) throw new ApplicationError("NOT_FOUND", "Thread was not found");
    const visible = thread.status === "published"
      || await canReadRetained(this.authorization, principal, thread.societyId, thread.authorId);
    if (!visible) throw new ApplicationError("NOT_FOUND", "Thread was not found");

    const includeRetained = principal === undefined
      ? false
      : await hasSocietyModeratorAuthority(this.authorization, principal, thread.societyId);
    const result = await this.repository.listComments(threadId, normalizePage(page), includeRetained);
    const authorById = await this.profile.findPublicIdentities(
      [...new Set(result.items.map((comment) => comment.authorId))],
    );
    const voteByComment = new Map<string, -1 | 0 | 1>();
    if (principal !== undefined) {
      const votes = await this.repository.findCommentVotes(
        result.items.map((comment) => comment.id),
        principal.userId,
      );
      for (const vote of votes) voteByComment.set(vote.commentId, vote.value);
    }
    return toCommentPageDto(result, authorById, voteByComment);
  }

  async listHomeFeed(
    principal: RequestPrincipal,
    page: PageRequest,
  ): Promise<HomeFeedPageDto> {
    const memberships = await this.authorization.membershipRepository
      .findActiveMembershipsByUser(principal.userId);
    const societyIds = memberships.map((membership) => membership.societyId);
    const result = await this.repository.listThreadsInSocieties(
      societyIds,
      normalizePage(page),
    );

    const threadIds = result.items.map((thread) => thread.id);
    const mediaByThread = await this.mediaByThread(result.items);
    const authorById = await this.identitiesFor(result.items);
    const societyById = await this.societiesFor(result.items);
    const votes = await this.repository.findThreadVotes(threadIds, principal.userId);
    const voteById = new Map(votes.map((vote) => [vote.threadId, vote.value]));

    const items: HomeFeedPageDto["items"] = result.items.flatMap((thread) => {
      const society = societyById.get(thread.societyId);
      if (society === undefined) return [];
      return [toHomeFeedThreadDto(
        thread,
        society,
        mediaByThread.get(thread.id) ?? [],
        authorById.get(thread.authorId) ?? null,
        voteById.get(thread.id) ?? 0,
      )];
    });

    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async listUserThreads(
    viewer: RequestPrincipal | undefined,
    authorId: string,
    page: PageRequest,
  ): Promise<UserThreadActivityPageDto> {
    const identity = await this.authorActivity(viewer, authorId);
    const result = await this.repository.listThreadsByAuthor(authorId, normalizePage(page));
    const societyById = await this.societiesFor(result.items);
    const voteByThread = new Map<string, -1 | 0 | 1>();
    if (viewer !== undefined) {
      const votes = await this.repository.findThreadVotes(
        result.items.map((thread) => thread.id),
        viewer.userId,
      );
      for (const vote of votes) voteByThread.set(vote.threadId, vote.value);
    }
    const items: UserThreadActivityDto[] = result.items.flatMap((thread) => {
      const society = societyById.get(thread.societyId);
      return society === undefined
        ? []
        : [toUserThreadActivityDto(thread, society, identity, voteByThread.get(thread.id) ?? 0)];
    });
    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async listUserComments(
    viewer: RequestPrincipal | undefined,
    authorId: string,
    page: PageRequest,
  ): Promise<UserCommentActivityPageDto> {
    const identity = await this.authorActivity(viewer, authorId);
    const result = await this.repository.listCommentsByAuthor(authorId, normalizePage(page));
    const threadIds = [...new Set(result.items.map((comment) => comment.threadId))];
    const threadById = new Map(
      (await this.repository.findThreadsByIds(threadIds)).map((thread) => [thread.id, thread]),
    );
    const societyById = await this.societiesFor([...threadById.values()]);
    const items: UserCommentActivityDto[] = result.items.flatMap((comment) => {
      const thread = threadById.get(comment.threadId);
      if (thread === undefined) return [];
      const society = societyById.get(thread.societyId);
      return society === undefined ? [] : [toUserCommentActivityDto(comment, thread, society, identity)];
    });
    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  private async mediaByThread(
    threads: readonly ThreadRecord[],
  ): Promise<ReadonlyMap<string, readonly ThreadMediaRecord[]>> {
    const id = await this.repository.listThreadMediaBatch(threads.map((thread) => thread.id));
    const grouped = new Map<string, ThreadMediaRecord[]>();
    for (const media of id) {
      const list = grouped.get(media.threadId);
      if (list === undefined) grouped.set(media.threadId, [media]);
      else list.push(media);
    }
    return grouped;
  }

  private async identitiesFor(
    threads: readonly ThreadRecord[],
  ): Promise<ReadonlyMap<string, ProfileIdentity>> {
    const authorIds = [...new Set(threads.map((thread) => thread.authorId))];
    return this.profile.findPublicIdentities(authorIds);
  }

  private async societiesFor(
    threads: readonly ThreadRecord[],
  ): Promise<ReadonlyMap<string, SocietyRecord>> {
    const ids = [...new Set(threads.map((thread) => thread.societyId))];
    const societies = await this.authorization.societyRepository.findSocietiesByIds(ids);
    return new Map(societies.map((society) => [society.id, society]));
  }

  private async authorActivity(
    viewer: RequestPrincipal | undefined,
    authorId: string,
  ): Promise<ProfileIdentity> {
    if (!(await this.profile.canReadActivityBy(viewer, authorId))) {
      throw new ApplicationError(
        "FORBIDDEN",
        "This profile is private and its activity is not available",
      );
    }
    const identity = await this.profile.findPublicIdentity(authorId);
    if (identity === null) {
      throw new ApplicationError("NOT_FOUND", "User was not found");
    }
    return identity;
  }
}

function normalizePage(page: PageRequest): PageRequest {
  const limit = normalizePageSize(page.limit);
  return page.cursor === undefined ? { limit } : { limit, cursor: page.cursor };
}
