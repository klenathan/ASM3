import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  assertCommentDepth,
  commentDepth,
  normalizeCommentBody,
  type CommentRecord,
} from "../domain/discussion";
import {
  assertMutationAuthority,
  canReadRetained,
  requireActiveMember,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization";
import type {
  CommentDto,
  CreateCommentCommand,
  UpdateCommentCommand,
} from "./discussion.dto";
import { toCommentDto } from "./discussion.mappers";
import type {
  CreateCommentInput,
  DiscussionRepository,
  UpdateCommentInput,
} from "./discussion.repository";

export interface CommentServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
  readonly transactions: TransactionManager<DiscussionRepository>;
  readonly clock: Clock;
}

export class CommentService {
  private readonly repository: DiscussionRepository;
  private readonly transactions: TransactionManager<DiscussionRepository>;
  private readonly clock: Clock;
  private readonly authorization: DiscussionAuthorizationDependencies;

  constructor(dependencies: CommentServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
    this.authorization = dependencies;
  }

  async createComment(
    principal: RequestPrincipal,
    threadId: string,
    command: CreateCommentCommand,
  ): Promise<CommentDto> {
    const thread = await this.threadOrThrow(threadId);
    await requireActiveMember(this.authorization, principal, thread.societyId);
    if (thread.status !== "published") {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }

    const parentId = command.parentId ?? null;
    const parent = parentId === null ? null : await this.parentOrThrow(parentId, threadId);
    if (parent !== null) {
      assertCommentDepth(await this.parentDepth(parent));
    }

    const now = this.clock.now();
    const input: CreateCommentInput = {
      id: randomUUID(),
      threadId,
      authorId: principal.userId,
      parentId,
      body: normalizeCommentBody(command.body),
      createdAt: now,
      updatedAt: now,
    };

    const comment = await this.transactions.withTransaction(async (repository) => {
      const lockedThread = await repository.findThreadForUpdate(threadId);
      if (lockedThread === null || lockedThread.status !== "published") {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      if (parentId !== null) {
        const lockedParent = await repository.findComment(parentId);
        if (lockedParent === null || lockedParent.threadId !== threadId) {
          throw new ApplicationError("VALIDATION_ERROR", "The parent comment must belong to this thread");
        }
      }

      const created = await repository.createComment(input);
      const updatedThread = await repository.incrementCommentCount(threadId, 1);
      if (updatedThread === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      await repository.actionEvents?.append({
        eventId: randomUUID(),
        eventType: "comment_created",
        schemaVersion: 1,
        actorUserId: principal.userId,
        actorPlatformRole: principal.platformRole,
        actorSocietyRole: null,
        occurredAt: now,
        targetType: "comment",
        targetId: created.id,
        societyId: updatedThread.societyId,
        threadId: created.threadId,
        commentId: created.id,
        reportId: null,
        correlationId: created.id,
        fromReaction: null,
        toReaction: null,
        metadata: {},
      });
      return created;
    });

    return toCommentDto(comment);
  }

  async getComment(
    principal: RequestPrincipal | undefined,
    commentId: string,
  ): Promise<CommentDto> {
    const comment = await this.commentOrThrow(commentId);
    const thread = await this.threadOrThrow(comment.threadId);
    const canRead = thread.status === "published" && comment.status === "published"
      || await canReadRetained(this.authorization, principal, thread.societyId, comment.authorId);
    if (!canRead) {
      throw new ApplicationError("NOT_FOUND", "Comment was not found");
    }

    return toCommentDto(comment);
  }

  async updateComment(
    principal: RequestPrincipal,
    commentId: string,
    command: UpdateCommentCommand,
  ): Promise<CommentDto> {
    const current = await this.commentOrThrow(commentId);
    const thread = await this.threadOrThrow(current.threadId);
    await assertMutationAuthority(this.authorization, principal, thread.societyId, current.authorId);
    if (thread.status === "deleted" || current.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "Comment was not found");
    }

    const input: UpdateCommentInput = {
      body: normalizeCommentBody(command.body),
      updatedAt: this.clock.now(),
    };
    const updated = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findCommentForUpdate(commentId);
      if (locked === null || locked.status === "deleted") {
        throw new ApplicationError("NOT_FOUND", "Comment was not found");
      }
      const result = await repository.updateComment(commentId, input);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Comment was not found");
      }
      if (result.body !== locked.body) {
        await repository.actionEvents?.append({
          eventId: randomUUID(),
          eventType: "comment_edited",
          schemaVersion: 1,
          actorUserId: principal.userId,
          actorPlatformRole: principal.platformRole,
          actorSocietyRole: null,
          occurredAt: input.updatedAt,
          targetType: "comment",
          targetId: result.id,
          societyId: thread.societyId,
          threadId: result.threadId,
          commentId: result.id,
          reportId: null,
          correlationId: result.id,
          fromReaction: null,
          toReaction: null,
          metadata: {},
        });
      }
      return result;
    });

    return toCommentDto(updated);
  }

  async deleteComment(principal: RequestPrincipal, commentId: string): Promise<CommentDto> {
    const current = await this.commentOrThrow(commentId);
    const thread = await this.threadOrThrow(current.threadId);
    await assertMutationAuthority(this.authorization, principal, thread.societyId, current.authorId);
    if (thread.status === "deleted") throw new ApplicationError("NOT_FOUND", "Comment was not found");
    if (current.status === "deleted") return toCommentDto(current);

    const now = this.clock.now();
    const deleted = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findCommentForUpdate(commentId);
      if (locked === null) {
        throw new ApplicationError("NOT_FOUND", "Comment was not found");
      }
      const result = await repository.softDeleteComment(commentId, now, now);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Comment was not found");
      }
      if (locked.status === "published") {
        const updatedThread = await repository.incrementCommentCount(locked.threadId, -1);
        if (updatedThread === null) {
          throw new ApplicationError("NOT_FOUND", "Thread was not found");
        }
      }
      await repository.actionEvents?.append({
        eventId: randomUUID(),
        eventType: "comment_deleted",
        schemaVersion: 1,
        actorUserId: principal.userId,
        actorPlatformRole: principal.platformRole,
        actorSocietyRole: null,
        occurredAt: now,
        targetType: "comment",
        targetId: result.id,
        societyId: thread.societyId,
        threadId: result.threadId,
        commentId: result.id,
        reportId: null,
        correlationId: result.id,
        fromReaction: null,
        toReaction: null,
        metadata: {},
      });
      return result;
    });

    return toCommentDto(deleted);
  }

  private async parentOrThrow(parentId: string, threadId: string): Promise<CommentRecord> {
    const parent = await this.repository.findComment(parentId);
    if (parent === null) {
      throw new ApplicationError("NOT_FOUND", "Parent comment was not found");
    }
    if (parent.threadId !== threadId) {
      throw new ApplicationError("VALIDATION_ERROR", "The parent comment must belong to this thread");
    }

    return parent;
  }

  private async parentDepth(parent: CommentRecord): Promise<number> {
    const parents = new Map<string, CommentRecord>();
    let current: CommentRecord | null = parent;
    while (current !== null) {
      parents.set(current.id, current);
      if (current.parentId === null) {
        break;
      }
      current = await this.repository.findComment(current.parentId);
      if (current === null) throw new ApplicationError("NOT_FOUND", "The parent comment was not found");
    }

    return commentDepth(parent.id, parents);
  }

  private async threadOrThrow(threadId: string) {
    const thread = await this.repository.findThread(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }
    return thread;
  }

  private async commentOrThrow(commentId: string) {
    const comment = await this.repository.findComment(commentId);
    if (comment === null) {
      throw new ApplicationError("NOT_FOUND", "Comment was not found");
    }
    return comment;
  }
}
