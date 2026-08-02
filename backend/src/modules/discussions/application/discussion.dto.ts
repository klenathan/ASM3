import type { PageResult } from "../../../shared/application/pagination";

export interface ThreadDto {
  readonly id: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string | null;
  readonly status: "published" | "removed" | "deleted";
  readonly score: number;
  readonly commentCount: number;
  readonly mediaIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export type ThreadPageDto = PageResult<ThreadDto>;

export interface CommentDto {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string | null;
  readonly status: "published" | "removed" | "deleted";
  readonly score: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export type CommentPageDto = PageResult<CommentDto>;

export interface CreateThreadCommand {
  readonly title: string;
  readonly body: string;
  readonly mediaIds?: readonly string[];
}

export interface UpdateThreadCommand {
  readonly title?: string;
  readonly body?: string;
  readonly mediaIds?: readonly string[];
}

export interface CreateCommentCommand {
  readonly body: string;
  readonly parentId?: string | null;
}

export interface UpdateCommentCommand {
  readonly body: string;
}

export interface VoteCommand {
  readonly value: -1 | 0 | 1;
}

export interface VoteDto {
  readonly targetType: "thread" | "comment";
  readonly targetId: string;
  readonly value: -1 | 0 | 1;
  readonly score: number;
}
