import type { PageResult } from "../../../shared/application/pagination";
import type { SocietyRecord } from "../../societies/domain/society";
import type { CommentRecord, ThreadRecord } from "../domain/discussion";
import type {
  AnalysisQueueThreadDto,
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
  myVote: -1 | 0 | 1 = 0,
  analysisDecision: "allow" | "review" | null = null,
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
    myVote,
    analysisDecision,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function toThreadPageDto(
  page: PageResult<ThreadRecord>,
  mediaByThread: ReadonlyMap<string, readonly ThreadMediaRecord[]>,
  authorById: ReadonlyMap<string, ProfileIdentity> = new Map(),
  voteByThread: ReadonlyMap<string, -1 | 0 | 1> = new Map(),
  decisions: ReadonlyMap<string, "allow" | "review"> = new Map(),
): ThreadPageDto {
  return {
    items: page.items.map((record) =>
      toThreadDto(
        record,
        mediaByThread.get(record.id) ?? [],
        authorById.get(record.authorId),
        voteByThread.get(record.id) ?? 0,
        decisions.get(record.id) ?? null,
      ),
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
  analysisDecision: "allow" | "review" | null = null,
): HomeFeedThreadDto {
  return {
    ...toThreadDto(record, media, author, myVote, analysisDecision),
    societySlug: society.slug,
    societyName: society.name,
    myVote,
  };
}

export function toAnalysisQueueThreadDto(
  record: ThreadRecord,
  society: SocietyRecord,
  media: readonly ThreadMediaRecord[] = [],
  author?: ProfileIdentity | null,
  analysisDecision: "allow" | "review" | null = null,
): AnalysisQueueThreadDto {
  return {
    ...toThreadDto(record, media, author, 0, analysisDecision),
    societySlug: society.slug,
    societyName: society.name,
  };
}

export function toCommentDto(
  record: CommentRecord,
  author?: ProfileIdentity | null,
  myVote: -1 | 0 | 1 = 0,
): CommentDto {
  return {
    id: record.id,
    threadId: record.threadId,
    authorId: record.authorId,
    parentId: record.parentId,
    body: record.body,
    status: record.status,
    score: record.score,
    authorDisplayName: author?.displayName ?? null,
    authorAvatarMediaId: author?.avatarMediaId ?? null,
    myVote,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function toCommentPageDto(
  page: PageResult<CommentRecord>,
  authorById: ReadonlyMap<string, ProfileIdentity> = new Map(),
  voteByComment: ReadonlyMap<string, -1 | 0 | 1> = new Map(),
): CommentPageDto {
  return {
    items: page.items.map((record) => toCommentDto(
      record,
      authorById.get(record.authorId),
      voteByComment.get(record.id) ?? 0,
    )),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export function toUserThreadActivityDto(
  record: ThreadRecord,
  society: SocietyRecord,
  identity: ProfileIdentity,
  myVote: -1 | 0 | 1 = 0,
  media: readonly ThreadMediaRecord[] = [],
  analysisDecision: "allow" | "review" | null = null,
): UserThreadActivityDto {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    score: record.score,
    commentCount: record.commentCount,
    mediaIds: media.map((item) => item.mediaId),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    societyId: society.id,
    societySlug: society.slug,
    societyName: society.name,
    authorId: record.authorId,
    authorDisplayName: identity.displayName,
    authorAvatarMediaId: identity.avatarMediaId,
    myVote,
    analysisDecision,
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
