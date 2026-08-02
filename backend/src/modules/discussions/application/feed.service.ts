import type { PageRequest } from "../../../shared/application/pagination.js";
import { normalizePageSize } from "../../../shared/application/pagination.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import {
  canReadRetained,
  hasSocietyModeratorAuthority,
  requireSociety,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization.js";
import type { CommentPageDto, ThreadPageDto } from "./discussion.dto.js";
import { toCommentPageDto, toThreadPageDto } from "./discussion.mappers.js";
import type { DiscussionRepository } from "./discussion.repository.js";

export interface FeedServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
}

export class FeedService {
  private readonly repository: DiscussionRepository;
  private readonly authorization: DiscussionAuthorizationDependencies;

  constructor(dependencies: FeedServiceDependencies) {
    this.repository = dependencies.repository;
    this.authorization = dependencies;
  }

  async listSocietyThreads(
    principal: RequestPrincipal | undefined,
    societyId: string,
    page: PageRequest,
  ): Promise<ThreadPageDto> {
    await requireSociety(this.authorization, societyId);
    const includeRetained = principal === undefined
      ? false
      : await hasSocietyModeratorAuthority(this.authorization, principal, societyId);
    const normalizedPage = normalizePage(page);
    const result = await this.repository.listThreads(societyId, normalizedPage, includeRetained);
    const media = await Promise.all(
      result.items.map(async (thread) => [thread.id, await this.repository.listThreadMedia(thread.id)] as const),
    );
    return toThreadPageDto(result, new Map(media));
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
}

function normalizePage(page: PageRequest): PageRequest {
  const limit = normalizePageSize(page.limit);
  return page.cursor === undefined ? { limit } : { limit, cursor: page.cursor };
}
