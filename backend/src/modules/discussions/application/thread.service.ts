import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock.js";
import { normalizePageSize } from "../../../shared/application/pagination.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import {
  assertMutationAuthority,
  canReadRetained,
  requireActiveMember,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization.js";
import type {
  CreateThreadCommand,
  ThreadDto,
  UpdateThreadCommand,
} from "./discussion.dto.js";
import { toThreadDto } from "./discussion.mappers.js";
import type {
  CreateThreadInput,
  DiscussionRepository,
  UpdateThreadInput,
} from "./discussion.repository.js";
import {
  normalizeThreadBody,
  normalizeThreadTitle,
} from "../domain/discussion.js";

export interface ThreadServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
  readonly transactions: TransactionManager<DiscussionRepository>;
  readonly clock: Clock;
}

export class ThreadService {
  private readonly repository: DiscussionRepository;
  private readonly transactions: TransactionManager<DiscussionRepository>;
  private readonly clock: Clock;
  private readonly authorization: DiscussionAuthorizationDependencies;

  constructor(dependencies: ThreadServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
    this.authorization = dependencies;
  }

  async createThread(
    principal: RequestPrincipal,
    societyId: string,
    command: CreateThreadCommand,
  ): Promise<ThreadDto> {
    await requireActiveMember(this.authorization, principal, societyId);
    const now = this.clock.now();
    const input: CreateThreadInput = {
      id: randomUUID(),
      societyId,
      authorId: principal.userId,
      title: normalizeThreadTitle(command.title),
      body: normalizeThreadBody(command.body),
      createdAt: now,
      updatedAt: now,
    };
    const mediaIds = normalizeMediaIds(command.mediaIds);

    const thread = await this.transactions.withTransaction(async (repository) => {
      const created = await repository.createThread(input);
      await repository.replaceThreadMedia(created.id, mediaIds);
      return created;
    });

    return toThreadDto(thread, await this.repository.listThreadMedia(thread.id));
  }

  async getThread(
    principal: RequestPrincipal | undefined,
    threadId: string,
  ): Promise<ThreadDto> {
    const thread = await this.threadOrThrow(threadId);
    if (
      thread.status !== "published" &&
      !(await canReadRetained(this.authorization, principal, thread.societyId, thread.authorId))
    ) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }

    return toThreadDto(thread, await this.repository.listThreadMedia(thread.id));
  }

  async updateThread(
    principal: RequestPrincipal,
    threadId: string,
    command: UpdateThreadCommand,
  ): Promise<ThreadDto> {
    const current = await this.threadOrThrow(threadId);
    await assertMutationAuthority(
      this.authorization,
      principal,
      current.societyId,
      current.authorId,
    );
    if (current.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }

    const now = this.clock.now();
    const input: UpdateThreadInput = {
      updatedAt: now,
      ...(command.title === undefined ? {} : { title: normalizeThreadTitle(command.title) }),
      ...(command.body === undefined ? {} : { body: normalizeThreadBody(command.body) }),
    };
    const mediaIds = command.mediaIds === undefined ? undefined : normalizeMediaIds(command.mediaIds);

    const updated = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findThreadForUpdate(threadId);
      if (locked === null || locked.status === "deleted") {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      const result = await repository.updateThread(threadId, input);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      if (mediaIds !== undefined) {
        await repository.replaceThreadMedia(threadId, mediaIds);
      }
      return result;
    });

    return toThreadDto(updated, await this.repository.listThreadMedia(threadId));
  }

  async deleteThread(principal: RequestPrincipal, threadId: string): Promise<ThreadDto> {
    const current = await this.threadOrThrow(threadId);
    await assertMutationAuthority(
      this.authorization,
      principal,
      current.societyId,
      current.authorId,
    );
    if (current.status === "deleted") {
      return toThreadDto(current, await this.repository.listThreadMedia(threadId));
    }

    const now = this.clock.now();
    const deleted = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findThreadForUpdate(threadId);
      if (locked === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      const result = await repository.softDeleteThread(threadId, now, now);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      return result;
    });

    return toThreadDto(deleted, await this.repository.listThreadMedia(threadId));
  }

  private async threadOrThrow(threadId: string) {
    const thread = await this.repository.findThread(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }
    return thread;
  }
}

function normalizeMediaIds(mediaIds: readonly string[] | undefined): readonly string[] {
  if (mediaIds === undefined) return [];
  if (mediaIds.length > 20 || new Set(mediaIds).size !== mediaIds.length) {
    throw new ApplicationError("VALIDATION_ERROR", "A thread can contain at most 20 unique media references");
  }

  return [...mediaIds];
}

export function normalizeThreadPageLimit(limit: number | undefined): number {
  return normalizePageSize(limit);
}
