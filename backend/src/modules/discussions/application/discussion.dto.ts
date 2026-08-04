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
  readonly authorDisplayName: string | null;
  readonly authorAvatarMediaId: string | null;
  readonly myVote: -1 | 0 | 1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  /** Latest automated content-analysis outcome; null when none/pending. */
  readonly analysisDecision: "allow" | "review" | null;
}

export type ThreadPageDto = PageResult<ThreadDto>;

export interface HomeFeedThreadDto extends ThreadDto {
  readonly societySlug: string;
  readonly societyName: string;
  readonly myVote: -1 | 0 | 1;
}

export type HomeFeedPageDto = PageResult<HomeFeedThreadDto>;

export interface CommentDto {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string | null;
  readonly status: "published" | "removed" | "deleted";
  readonly score: number;
  readonly authorDisplayName: string | null;
  readonly authorAvatarMediaId: string | null;
  readonly myVote: -1 | 0 | 1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export type CommentPageDto = PageResult<CommentDto>;

export interface UserThreadActivityDto {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly score: number;
  readonly commentCount: number;
  readonly mediaIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly societyId: string;
  readonly societySlug: string;
  readonly societyName: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly authorAvatarMediaId: string | null;
  readonly myVote: -1 | 0 | 1;
  readonly analysisDecision: "allow" | "review" | null;
}

export type UserThreadActivityPageDto = PageResult<UserThreadActivityDto>;

export interface UserCommentActivityDto {
  readonly id: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly societyId: string;
  readonly societySlug: string;
  readonly societyName: string;
  readonly body: string | null;
  readonly score: number;
  readonly createdAt: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly authorAvatarMediaId: string | null;
}

export type UserCommentActivityPageDto = PageResult<UserCommentActivityDto>;

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
