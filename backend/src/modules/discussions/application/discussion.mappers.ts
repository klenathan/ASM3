import type { PageResult } from "../../../shared/application/pagination";
import type { CommentRecord, ThreadRecord } from "../domain/discussion";
import type { CommentDto, CommentPageDto, ThreadDto, ThreadPageDto } from "./discussion.dto";
import type { ThreadMediaRecord } from "./discussion.repository";

export function toThreadDto(
  record: ThreadRecord,
  media: readonly ThreadMediaRecord[] = [],
): ThreadDto {
  return {
    id: record.id,
    societyId: record.societyId,
    authorId: record.authorId,
    title: record.title,
    body: record.body,
    status: record.status,
    score: record.score,
    commentCount: record.commentCount,
    mediaIds: media.map((item) => item.mediaId),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function toThreadPageDto(
  page: PageResult<ThreadRecord>,
  mediaByThread: ReadonlyMap<string, readonly ThreadMediaRecord[]>,
): ThreadPageDto {
  return {
    items: page.items.map((record) => toThreadDto(record, mediaByThread.get(record.id) ?? [])),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export function toCommentDto(record: CommentRecord): CommentDto {
  return {
    id: record.id,
    threadId: record.threadId,
    authorId: record.authorId,
    parentId: record.parentId,
    body: record.body,
    status: record.status,
    score: record.score,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function toCommentPageDto(page: PageResult<CommentRecord>): CommentPageDto {
  return {
    items: page.items.map(toCommentDto),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}
