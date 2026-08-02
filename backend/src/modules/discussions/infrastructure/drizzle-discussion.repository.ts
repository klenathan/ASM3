import { and, asc, desc, eq, gte, gt, lt, or, sql } from "drizzle-orm";

import type { Database } from "../../../db/client";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError, InvalidCursorError } from "../../../shared/domain/errors";
import {
  cursorFor,
  decodeCursor,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "../../../shared/application/pagination";
import {
  assertCommentStatus,
  assertThreadStatus,
  type CommentRecord,
  type CommentVoteRecord,
  type ThreadRecord,
  type ThreadVoteRecord,
} from "../domain/discussion";
import type {
  CreateCommentInput,
  CreateThreadInput,
  DiscussionRepository,
  ThreadMediaRecord,
  UpdateCommentInput,
  UpdateThreadInput,
} from "../application/discussion.repository";
import {
  commentVotes,
  comments,
  threadMedia,
  threadVotes,
  threads,
} from "./discussion.tables";

type DiscussionExecutor = Pick<Database, "select" | "insert" | "update" | "delete">;

export class DrizzleDiscussionRepository implements DiscussionRepository {
  private readonly executor: DiscussionExecutor;

  constructor(executor: DiscussionExecutor) {
    this.executor = executor;
  }

  async listThreads(
    societyId: string,
    page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<ThreadRecord>> {
    const after = page.cursor === undefined ? undefined : threadAfter(page.cursor);
    const societyFilter = eq(threads.societyId, societyId);
    const statusFilter = includeRetained ? undefined : eq(threads.status, "published");
    const where = after === undefined
      ? and(societyFilter, statusFilter)
      : and(societyFilter, statusFilter, after);
    const rows = await this.executor
      .select()
      .from(threads)
      .where(where)
      .orderBy(desc(threads.createdAt), desc(threads.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit).map(toThread);
    const last = items.at(-1);
    const hasMore = rows.length > page.limit;

    return {
      items,
      hasMore,
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(cursorFor(last.createdAt, last.id))
        : null,
    };
  }

  async listThreadsByAuthor(
    authorId: string,
    page: PageRequest,
  ): Promise<PageResult<ThreadRecord>> {
    const after = page.cursor === undefined ? undefined : threadAfter(page.cursor);
    const authorFilter = eq(threads.authorId, authorId);
    const statusFilter = eq(threads.status, "published");
    const where = after === undefined
      ? and(authorFilter, statusFilter)
      : and(authorFilter, statusFilter, after);
    const rows = await this.executor
      .select()
      .from(threads)
      .where(where)
      .orderBy(desc(threads.createdAt), desc(threads.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit).map(toThread);
    const last = items.at(-1);
    const hasMore = rows.length > page.limit;

    return {
      items,
      hasMore,
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(cursorFor(last.createdAt, last.id))
        : null,
    };
  }

  async findThread(threadId: string): Promise<ThreadRecord | null> {
    return this.findThreadInternal(threadId, false);
  }

  async findThreadForUpdate(threadId: string): Promise<ThreadRecord | null> {
    return this.findThreadInternal(threadId, true);
  }

  async createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    const rows = await this.executor.insert(threads).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("DISCUSSION_DATA_INVALID", "The thread could not be created");
    }
    return toThread(row);
  }

  async updateThread(threadId: string, input: UpdateThreadInput): Promise<ThreadRecord | null> {
    const values: {
      readonly title?: string;
      readonly body?: string;
      readonly updatedAt: Date;
    } = {
      updatedAt: input.updatedAt,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.body === undefined ? {} : { body: input.body }),
    };
    const rows = await this.executor
      .update(threads)
      .set(values)
      .where(eq(threads.id, threadId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async softDeleteThread(
    threadId: string,
    deletedAt: Date,
    updatedAt: Date,
  ): Promise<ThreadRecord | null> {
    const rows = await this.executor
      .update(threads)
      .set({ status: "deleted", body: null, deletedAt, updatedAt })
      .where(eq(threads.id, threadId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async listThreadMedia(threadId: string): Promise<readonly ThreadMediaRecord[]> {
    const rows = await this.executor
      .select()
      .from(threadMedia)
      .where(eq(threadMedia.threadId, threadId))
      .orderBy(asc(threadMedia.position), asc(threadMedia.mediaId));
    return rows.map((row) => ({
      threadId: row.threadId,
      mediaId: row.mediaId,
      position: row.position,
    }));
  }

  async replaceThreadMedia(
    threadId: string,
    mediaIds: readonly string[],
  ): Promise<readonly ThreadMediaRecord[]> {
    await this.executor.delete(threadMedia).where(eq(threadMedia.threadId, threadId));
    if (mediaIds.length > 0) {
      await this.executor.insert(threadMedia).values(
        mediaIds.map((mediaId, position) => ({ threadId, mediaId, position })),
      );
    }
    return this.listThreadMedia(threadId);
  }

  async listComments(
    threadId: string,
    page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<CommentRecord>> {
    const after = page.cursor === undefined ? undefined : commentAfter(page.cursor);
    const threadFilter = eq(comments.threadId, threadId);
    const statusFilter = includeRetained ? undefined : eq(comments.status, "published");
    const where = after === undefined
      ? and(threadFilter, statusFilter)
      : and(threadFilter, statusFilter, after);
    const rows = await this.executor
      .select()
      .from(comments)
      .where(where)
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit).map(toComment);
    const last = items.at(-1);
    const hasMore = rows.length > page.limit;

    return {
      items,
      hasMore,
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(cursorFor(last.createdAt, last.id))
        : null,
    };
  }

  async listCommentsByAuthor(
    authorId: string,
    page: PageRequest,
  ): Promise<PageResult<CommentRecord>> {
    const after = page.cursor === undefined ? undefined : commentAfter(page.cursor);
    const authorFilter = eq(comments.authorId, authorId);
    const statusFilter = eq(comments.status, "published");
    const where = after === undefined
      ? and(authorFilter, statusFilter)
      : and(authorFilter, statusFilter, after);
    const rows = await this.executor
      .select()
      .from(comments)
      .where(where)
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit).map(toComment);
    const last = items.at(-1);
    const hasMore = rows.length > page.limit;

    return {
      items,
      hasMore,
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(cursorFor(last.createdAt, last.id))
        : null,
    };
  }

  async findComment(commentId: string): Promise<CommentRecord | null> {
    return this.findCommentInternal(commentId, false);
  }

  async findCommentForUpdate(commentId: string): Promise<CommentRecord | null> {
    return this.findCommentInternal(commentId, true);
  }

  async createComment(input: CreateCommentInput): Promise<CommentRecord> {
    const rows = await this.executor.insert(comments).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("DISCUSSION_DATA_INVALID", "The comment could not be created");
    }
    return toComment(row);
  }

  async updateComment(commentId: string, input: UpdateCommentInput): Promise<CommentRecord | null> {
    const rows = await this.executor
      .update(comments)
      .set({ body: input.body, updatedAt: input.updatedAt })
      .where(eq(comments.id, commentId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toComment(row);
  }

  async softDeleteComment(
    commentId: string,
    deletedAt: Date,
    updatedAt: Date,
  ): Promise<CommentRecord | null> {
    const rows = await this.executor
      .update(comments)
      .set({ status: "deleted", body: null, deletedAt, updatedAt })
      .where(eq(comments.id, commentId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toComment(row);
  }

  async incrementCommentCount(threadId: string, delta: number): Promise<ThreadRecord | null> {
    const rows = await this.executor
      .update(threads)
      .set({ commentCount: sql`${threads.commentCount} + ${delta}` })
      .where(and(
        eq(threads.id, threadId),
        delta < 0 ? gte(threads.commentCount, -delta) : undefined,
      ))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async findThreadVote(threadId: string, userId: string): Promise<ThreadVoteRecord | null> {
    const rows = await this.executor
      .select()
      .from(threadVotes)
      .where(and(eq(threadVotes.threadId, threadId), eq(threadVotes.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toThreadVote(row);
  }

  async createThreadVote(input: {
    readonly threadId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<ThreadVoteRecord> {
    const rows = await this.executor.insert(threadVotes).values(input).returning();
    const row = rows[0];
    if (row === undefined) throw new ApplicationError("DISCUSSION_DATA_INVALID", "The vote could not be created");
    return toThreadVote(row);
  }

  async updateThreadVote(
    threadId: string,
    userId: string,
    value: -1 | 1,
    updatedAt: Date,
  ): Promise<ThreadVoteRecord | null> {
    const rows = await this.executor
      .update(threadVotes)
      .set({ value, updatedAt })
      .where(and(eq(threadVotes.threadId, threadId), eq(threadVotes.userId, userId)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThreadVote(row);
  }

  async deleteThreadVote(threadId: string, userId: string): Promise<boolean> {
    const rows = await this.executor
      .delete(threadVotes)
      .where(and(eq(threadVotes.threadId, threadId), eq(threadVotes.userId, userId)))
      .returning({ threadId: threadVotes.threadId });
    return rows.length > 0;
  }

  async incrementThreadScore(threadId: string, delta: number): Promise<ThreadRecord | null> {
    const rows = await this.executor
      .update(threads)
      .set({ score: sql`${threads.score} + ${delta}` })
      .where(eq(threads.id, threadId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async findCommentVote(commentId: string, userId: string): Promise<CommentVoteRecord | null> {
    const rows = await this.executor
      .select()
      .from(commentVotes)
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toCommentVote(row);
  }

  async createCommentVote(input: {
    readonly commentId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<CommentVoteRecord> {
    const rows = await this.executor.insert(commentVotes).values(input).returning();
    const row = rows[0];
    if (row === undefined) throw new ApplicationError("DISCUSSION_DATA_INVALID", "The vote could not be created");
    return toCommentVote(row);
  }

  async updateCommentVote(
    commentId: string,
    userId: string,
    value: -1 | 1,
    updatedAt: Date,
  ): Promise<CommentVoteRecord | null> {
    const rows = await this.executor
      .update(commentVotes)
      .set({ value, updatedAt })
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toCommentVote(row);
  }

  async deleteCommentVote(commentId: string, userId: string): Promise<boolean> {
    const rows = await this.executor
      .delete(commentVotes)
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)))
      .returning({ commentId: commentVotes.commentId });
    return rows.length > 0;
  }

  async incrementCommentScore(commentId: string, delta: number): Promise<CommentRecord | null> {
    const rows = await this.executor
      .update(comments)
      .set({ score: sql`${comments.score} + ${delta}` })
      .where(eq(comments.id, commentId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toComment(row);
  }

  private async findThreadInternal(threadId: string, lock: boolean): Promise<ThreadRecord | null> {
    const query = this.executor
      .select()
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1);
    const rows = lock ? await query.for("update") : await query;
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  private async findCommentInternal(commentId: string, lock: boolean): Promise<CommentRecord | null> {
    const query = this.executor
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    const rows = lock ? await query.for("update") : await query;
    const row = rows[0];
    return row === undefined ? null : toComment(row);
  }
}

export class DrizzleDiscussionTransactionManager implements TransactionManager<DiscussionRepository> {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(work: (transaction: DiscussionRepository) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      work(new DrizzleDiscussionRepository(transaction)),
    );
  }
}

function threadAfter(encoded: string) {
  const cursor = decodeCursor(encoded);
  const date = cursorDate(cursor.value);
  if (!isUuid(cursor.id)) throw new InvalidCursorError();
  return or(
    lt(threads.createdAt, date),
    and(eq(threads.createdAt, date), lt(threads.id, cursor.id)),
  );
}

function commentAfter(encoded: string) {
  const cursor = decodeCursor(encoded);
  const date = cursorDate(cursor.value);
  if (!isUuid(cursor.id)) throw new InvalidCursorError();
  return or(
    gt(comments.createdAt, date),
    and(eq(comments.createdAt, date), gt(comments.id, cursor.id)),
  );
}

function cursorDate(value: string | number): Date {
  if (typeof value !== "string") throw new InvalidCursorError();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidCursorError();
  return date;
}

function toThread(row: typeof threads.$inferSelect): ThreadRecord {
  return {
    id: row.id,
    societyId: row.societyId,
    authorId: row.authorId,
    title: row.title,
    body: row.body,
    status: assertThreadStatus(row.status),
    score: row.score,
    commentCount: row.commentCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toComment(row: typeof comments.$inferSelect): CommentRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    parentId: row.parentId,
    body: row.body,
    status: assertCommentStatus(row.status),
    score: row.score,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toThreadVote(row: typeof threadVotes.$inferSelect): ThreadVoteRecord {
  if (row.value !== -1 && row.value !== 1) {
    throw new ApplicationError("DISCUSSION_DATA_INVALID", "The thread vote contains invalid value");
  }
  return {
    threadId: row.threadId,
    userId: row.userId,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCommentVote(row: typeof commentVotes.$inferSelect): CommentVoteRecord {
  if (row.value !== -1 && row.value !== 1) {
    throw new ApplicationError("DISCUSSION_DATA_INVALID", "The comment vote contains invalid value");
  }
  return {
    commentId: row.commentId,
    userId: row.userId,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
