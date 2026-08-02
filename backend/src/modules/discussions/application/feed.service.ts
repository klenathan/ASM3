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
import type { CommentPageDto, ThreadPageDto } from "./discussion.dto";
import { toCommentPageDto, toThreadPageDto } from "./discussion.mappers";
import type { DiscussionRepository } from "./discussion.repository";

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
