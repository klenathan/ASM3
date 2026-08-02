import type { PageResult } from "../../../shared/application/pagination";
import type { SocietyRecord } from "../../societies/domain/society";
import type { CommentRecord, ThreadRecord } from "../domain/discussion";
import type {
  CommentDto,
  CommentPageDto,
  HomeFeedThreadDto,
  ThreadDto,
  ThreadPageDto,
  UserCommentActivityDto,
  UserThreadActivityDto,
} from "./discussion.dto";
import type { ThreadMediaRecord } from "./discussion.repository";

export interface ProfileIdentity {
  readonly displayName: string;
  readonly avatarMediaId: string | null;
}

export function toThreadDto(
  record: ThreadRecord,
  media: readonly ThreadMediaRecord[] = [],
  author?: ProfileIdentity | null,
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
    authorDisplayName: author?.displayName ?? null,
    authorAvatarMediaId: author?.avatarMediaId ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function toThreadPageDto(
  page: PageResult<ThreadRecord>,
  mediaByThread: ReadonlyMap<string, readonly ThreadMediaRecord[]>,
  authorById: ReadonlyMap<string, ProfileIdentity> = new Map(),
): ThreadPageDto {
  return {
    items: page.items.map((record) =>
      toThreadDto(record, mediaByThread.get(record.id) ?? [], authorById.get(record.authorId)),
    ),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export function toHomeFeedThreadDto(
  record: ThreadRecord,
  society: SocietyRecord,
  media: readonly ThreadMediaRecord[] = [],
  author?: ProfileIdentity | null,
  myVote: -1 | 0 | 1 = 0,
): HomeFeedThreadDto {
  return {
    ...toThreadDto(record, media, author),
    societySlug: society.slug,
    societyName: society.name,
    myVote,
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

export function toUserThreadActivityDto(
  record: ThreadRecord,
  society: SocietyRecord,
  identity: ProfileIdentity,
): UserThreadActivityDto {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    score: record.score,
    commentCount: record.commentCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    societyId: society.id,
    societySlug: society.slug,
    societyName: society.name,
    authorId: record.authorId,
    authorDisplayName: identity.displayName,
    authorAvatarMediaId: identity.avatarMediaId,
  };
}

export function toUserCommentActivityDto(
  record: CommentRecord,
  thread: ThreadRecord,
  society: SocietyRecord,
  identity: ProfileIdentity,
): UserCommentActivityDto {
  return {
    id: record.id,
    threadId: record.threadId,
    threadTitle: thread.title,
    societyId: society.id,
    societySlug: society.slug,
    societyName: society.name,
    body: record.body,
    score: record.score,
    createdAt: record.createdAt.toISOString(),
    authorId: record.authorId,
    authorDisplayName: identity.displayName,
    authorAvatarMediaId: identity.avatarMediaId,
  };
}
