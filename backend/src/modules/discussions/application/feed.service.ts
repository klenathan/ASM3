import type { PageRequest } from "../../../shared/application/pagination";
import { normalizePageSize } from "../../../shared/application/pagination";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
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

/**
 * Port into the identity module. The discussions module never reads identity
 * storage directly; it receives profile identity and privacy decisions through
 * this explicitly injected boundary to keep modules decoupled.
 */
export interface DiscussionProfilePort {
  findPublicIdentity(userId: string): Promise<ProfileIdentity | null>;
  canReadActivityBy(
    viewer: RequestPrincipal | undefined,
    authorId: string,
  ): Promise<boolean>;
}

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
    const media = await Promise.all(
      result.items.map(async (thread) => [thread.id, await this.repository.listThreadMedia(thread.id)] as const),
    );
    const authorById = new Map<string, ProfileIdentity>();
    for (const thread of result.items) {
      if (authorById.has(thread.authorId)) continue;
      const identity = await this.profile.findPublicIdentity(thread.authorId);
      if (identity !== null) authorById.set(thread.authorId, identity);
    }
    return toThreadPageDto(result, new Map(media), authorById);
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
    return toCommentPageDto(
      await this.repository.listComments(threadId, normalizePage(page), includeRetained),
    );
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

    const items: Array<Awaited<ReturnType<typeof toHomeFeedThreadDto>>> = [];
    for (const thread of result.items) {
      const society = await this.authorization.societyRepository.findSocietyById(thread.societyId);
      if (society === null) continue;
      const media = await this.repository.listThreadMedia(thread.id);
      const identity = await this.profile.findPublicIdentity(thread.authorId);
      const vote = await this.repository.findThreadVote(thread.id, principal.userId);
      items.push(toHomeFeedThreadDto(thread, society, media, identity, vote?.value ?? 0));
    }

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
    const items: UserThreadActivityDto[] = [];
    for (const thread of result.items) {
      const society = await this.authorization.societyRepository.findSocietyById(thread.societyId);
      if (society === null) continue;
      items.push(toUserThreadActivityDto(thread, society, identity));
    }
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
    const items: UserCommentActivityDto[] = [];
    for (const comment of result.items) {
      const thread = await this.repository.findThread(comment.threadId);
      if (thread === null) continue;
      const society = await this.authorization.societyRepository.findSocietyById(thread.societyId);
      if (society === null) continue;
      items.push(toUserCommentActivityDto(comment, thread, society, identity));
    }
    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
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
