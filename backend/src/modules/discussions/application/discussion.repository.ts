import type { PageRequest, PageResult } from "../../../shared/application/pagination.js";
import type {
  CommentRecord,
  CommentVoteRecord,
  ThreadRecord,
  ThreadVoteRecord,
} from "../domain/discussion.js";

export interface ThreadMediaRecord {
  readonly threadId: string;
  readonly mediaId: string;
  readonly position: number;
}

export interface CreateThreadInput {
  readonly id: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateThreadInput {
  readonly title?: string;
  readonly body?: string;
  readonly updatedAt: Date;
}

export interface CreateCommentInput {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateCommentInput {
  readonly body: string;
  readonly updatedAt: Date;
}

export interface DiscussionRepository {
  listThreads(
    societyId: string,
    page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<ThreadRecord>>;
  findThread(threadId: string): Promise<ThreadRecord | null>;
  findThreadForUpdate(threadId: string): Promise<ThreadRecord | null>;
  createThread(input: CreateThreadInput): Promise<ThreadRecord>;
  updateThread(threadId: string, input: UpdateThreadInput): Promise<ThreadRecord | null>;
  softDeleteThread(threadId: string, deletedAt: Date, updatedAt: Date): Promise<ThreadRecord | null>;
  listThreadMedia(threadId: string): Promise<readonly ThreadMediaRecord[]>;
  replaceThreadMedia(threadId: string, mediaIds: readonly string[]): Promise<readonly ThreadMediaRecord[]>;

  listComments(
    threadId: string,
    page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<CommentRecord>>;
  findComment(commentId: string): Promise<CommentRecord | null>;
  findCommentForUpdate(commentId: string): Promise<CommentRecord | null>;
  createComment(input: CreateCommentInput): Promise<CommentRecord>;
  updateComment(commentId: string, input: UpdateCommentInput): Promise<CommentRecord | null>;
  softDeleteComment(commentId: string, deletedAt: Date, updatedAt: Date): Promise<CommentRecord | null>;
  incrementCommentCount(threadId: string, delta: number): Promise<ThreadRecord | null>;

  findThreadVote(threadId: string, userId: string): Promise<ThreadVoteRecord | null>;
  createThreadVote(input: {
    readonly threadId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<ThreadVoteRecord>;
  updateThreadVote(
    threadId: string,
    userId: string,
    value: -1 | 1,
    updatedAt: Date,
  ): Promise<ThreadVoteRecord | null>;
  deleteThreadVote(threadId: string, userId: string): Promise<boolean>;
  incrementThreadScore(threadId: string, delta: number): Promise<ThreadRecord | null>;

  findCommentVote(commentId: string, userId: string): Promise<CommentVoteRecord | null>;
  createCommentVote(input: {
    readonly commentId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<CommentVoteRecord>;
  updateCommentVote(
    commentId: string,
    userId: string,
    value: -1 | 1,
    updatedAt: Date,
  ): Promise<CommentVoteRecord | null>;
  deleteCommentVote(commentId: string, userId: string): Promise<boolean>;
  incrementCommentScore(commentId: string, delta: number): Promise<CommentRecord | null>;
}
