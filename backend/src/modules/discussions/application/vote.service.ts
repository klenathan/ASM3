import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { assertVoteValue, type CommentRecord, type ThreadRecord } from "../domain/discussion";
import {
  requireActiveMember,
  requireSociety,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization";
import type { VoteDto } from "./discussion.dto";
import type { DiscussionRepository } from "./discussion.repository";

export interface VoteServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
  readonly transactions: TransactionManager<DiscussionRepository>;
  readonly clock: Clock;
}

export class VoteService {
  private readonly repository: DiscussionRepository;
  private readonly transactions: TransactionManager<DiscussionRepository>;
  private readonly clock: Clock;
  private readonly authorization: DiscussionAuthorizationDependencies;

  constructor(dependencies: VoteServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
    this.authorization = dependencies;
  }

  async voteThread(
    principal: RequestPrincipal,
    threadId: string,
    value: number,
  ): Promise<VoteDto> {
    const thread = await this.threadOrThrow(threadId);
    await requireActiveMember(this.authorization, principal, thread.societyId);
    if (thread.status !== "published") throw new ApplicationError("NOT_FOUND", "Thread was not found");
    return this.setThreadVote(principal.userId, thread, assertVoteValue(value));
  }

  async voteComment(
    principal: RequestPrincipal,
    commentId: string,
    value: number,
  ): Promise<VoteDto> {
    const comment = await this.commentOrThrow(commentId);
    const thread = await this.threadOrThrow(comment.threadId);
    await requireActiveMember(this.authorization, principal, thread.societyId);
    if (thread.status !== "published" || comment.status !== "published") {
      throw new ApplicationError("NOT_FOUND", "Comment was not found");
    }
    return this.setCommentVote(principal.userId, comment, assertVoteValue(value));
  }

  private async setThreadVote(
    userId: string,
    thread: ThreadRecord,
    value: -1 | 0 | 1,
  ): Promise<VoteDto> {
    const now = this.clock.now();
    const result = await this.transactions.withTransaction(async (repository) => {
      const lockedThread = await repository.findThreadForUpdate(thread.id);
      if (lockedThread === null || lockedThread.status !== "published") {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      const previous = await repository.findThreadVote(thread.id, userId);
      const oldValue = previous?.value ?? 0;
      if (oldValue === value) {
        return { score: lockedThread.score, value };
      }

      if (value === 0) {
        if (previous !== null) await repository.deleteThreadVote(thread.id, userId);
      } else if (previous === null) {
        await repository.createThreadVote({
          threadId: thread.id,
          userId,
          value,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await repository.updateThreadVote(thread.id, userId, value, now);
      }

      const updated = await repository.incrementThreadScore(thread.id, value - oldValue);
      if (updated === null) throw new ApplicationError("NOT_FOUND", "Thread was not found");
      return { score: updated.score, value };
    });

    return { targetType: "thread", targetId: thread.id, ...result };
  }

  private async setCommentVote(
    userId: string,
    comment: CommentRecord,
    value: -1 | 0 | 1,
  ): Promise<VoteDto> {
    const now = this.clock.now();
    const result = await this.transactions.withTransaction(async (repository) => {
      const lockedComment = await repository.findCommentForUpdate(comment.id);
      if (lockedComment === null || lockedComment.status !== "published") {
        throw new ApplicationError("NOT_FOUND", "Comment was not found");
      }
      const previous = await repository.findCommentVote(comment.id, userId);
      const oldValue = previous?.value ?? 0;
      if (oldValue === value) {
        return { score: lockedComment.score, value };
      }

      if (value === 0) {
        if (previous !== null) await repository.deleteCommentVote(comment.id, userId);
      } else if (previous === null) {
        await repository.createCommentVote({
          commentId: comment.id,
          userId,
          value,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await repository.updateCommentVote(comment.id, userId, value, now);
      }

      const updated = await repository.incrementCommentScore(comment.id, value - oldValue);
      if (updated === null) throw new ApplicationError("NOT_FOUND", "Comment was not found");
      return { score: updated.score, value };
    });

    return { targetType: "comment", targetId: comment.id, ...result };
  }

  private async threadOrThrow(threadId: string) {
    const thread = await this.repository.findThread(threadId);
    if (thread === null) throw new ApplicationError("NOT_FOUND", "Thread was not found");
    await requireSociety(this.authorization, thread.societyId);
    return thread;
  }

  private async commentOrThrow(commentId: string) {
    const comment = await this.repository.findComment(commentId);
    if (comment === null) throw new ApplicationError("NOT_FOUND", "Comment was not found");
    return comment;
  }
}
