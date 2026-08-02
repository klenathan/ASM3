import { ApplicationError } from "../../../shared/domain/errors.js";

export type ThreadStatus = "published" | "removed" | "deleted";
export type CommentStatus = "published" | "removed" | "deleted";

export const MAX_COMMENT_DEPTH = 3;

export interface ThreadRecord {
  readonly id: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string | null;
  readonly status: ThreadStatus;
  readonly score: number;
  readonly commentCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface CommentRecord {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string | null;
  readonly status: CommentStatus;
  readonly score: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ThreadVoteRecord {
  readonly threadId: string;
  readonly userId: string;
  readonly value: -1 | 1;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommentVoteRecord {
  readonly commentId: string;
  readonly userId: string;
  readonly value: -1 | 1;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function assertThreadStatus(value: string): ThreadStatus {
  if (value !== "published" && value !== "removed" && value !== "deleted") {
    throw new ApplicationError("DISCUSSION_DATA_INVALID", "The thread contains invalid state");
  }

  return value;
}

export function assertCommentStatus(value: string): CommentStatus {
  if (value !== "published" && value !== "removed" && value !== "deleted") {
    throw new ApplicationError("DISCUSSION_DATA_INVALID", "The comment contains invalid state");
  }

  return value;
}

export function assertVoteValue(value: number): -1 | 0 | 1 {
  if (value !== -1 && value !== 0 && value !== 1) {
    throw new ApplicationError("VALIDATION_ERROR", "Vote value must be -1, 0, or 1");
  }

  return value;
}

export function normalizeThreadTitle(value: string): string {
  return normalizeText(value, 300, "Thread title");
}

export function normalizeThreadBody(value: string): string {
  return normalizeText(value, 100_000, "Thread body");
}

export function normalizeCommentBody(value: string): string {
  return normalizeText(value, 20_000, "Comment body");
}

export function commentDepth(
  commentId: string | null,
  parents: ReadonlyMap<string, CommentRecord>,
): number {
  let depth = 1;
  let currentId = commentId;
  const visited = new Set<string>();

  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new ApplicationError("DISCUSSION_DATA_INVALID", "The comment parent chain contains a cycle");
    }
    visited.add(currentId);

    const parent = parents.get(currentId);
    if (parent === undefined) {
      throw new ApplicationError("NOT_FOUND", "The parent comment was not found");
    }

    depth += 1;
    currentId = parent.parentId;
  }

  return depth;
}

export function assertCommentDepth(depth: number): void {
  if (depth > MAX_COMMENT_DEPTH) {
    throw new ApplicationError(
      "COMMENT_DEPTH_EXCEEDED",
      `Comments cannot be nested more than ${MAX_COMMENT_DEPTH} levels`,
    );
  }
}

function normalizeText(value: string, maxLength: number, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${field} must be between 1 and ${maxLength} characters`,
    );
  }

  return normalized;
}
