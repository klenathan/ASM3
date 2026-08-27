import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import type { Database } from "../../../db/client";
import type { TransactionManager } from "../../../shared/application/transaction";
import {
  cursorFor,
  decodeCursor,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "../../../shared/application/pagination";
import { ApplicationError } from "../../../shared/domain/errors";
import type {
  AuthUserRecord,
  IdentityAccountRecord,
  PlatformRole,
  UserProfileRecord,
  UserStatus,
} from "../../identity/domain/identity.types";
import { authUsers } from "../../identity/infrastructure/auth.tables";
import { userProfiles } from "../../identity/infrastructure/user-profile.tables";
import {
  assertCommentStatus,
  assertThreadStatus,
  type CommentRecord,
  type ThreadRecord,
} from "../../discussions/domain/discussion";
import { comments, threads } from "../../discussions/infrastructure/discussion.tables";
import {
  assertMembershipRole,
  assertMembershipState,
  type MembershipRecord,
} from "../../societies/domain/membership";
import { societyMemberships } from "../../societies/infrastructure/society.tables";
import type {
  CommentTargetRecord,
  CreateModerationActionInput,
  CreateReportInput,
  ModerationRepository,
  UpdateModerationMembershipInput,
  UpdateModerationUserInput,
  UpdateReportInput,
} from "../application/moderation.repository";
import {
  assertReportStatus,
  type ModerationActionRecord,
  type ReportRecord,
  type ReportStatus,
  type ReportTargetType,
} from "../domain/moderation";
import { moderationActions, reports } from "./moderation.tables";

type ModerationExecutor = Pick<Database, "select" | "insert" | "update">;

export class DrizzleModerationRepository implements ModerationRepository {
  private readonly executor: ModerationExecutor;

  constructor(executor: ModerationExecutor) {
    this.executor = executor;
  }

  async listReporterReports(
    reporterId: string,
    page: PageRequest,
  ): Promise<PageResult<ReportRecord>> {
    const after = page.cursor === undefined ? undefined : reportAfter(page.cursor, "desc");
    const where = after === undefined
      ? eq(reports.reporterId, reporterId)
      : and(eq(reports.reporterId, reporterId), after);
    const rows = await this.executor
      .select()
      .from(reports)
      .where(where)
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(page.limit + 1);
    return pageResult(rows, page.limit);
  }

  async listSocietyReports(
    societyId: string,
    page: PageRequest,
  ): Promise<PageResult<ReportRecord>> {
    const after = page.cursor === undefined ? undefined : reportAfter(page.cursor, "asc");
    const activeStatus = or(eq(reports.status, "pending"), eq(reports.status, "in_review"));
    const where = after === undefined
      ? and(eq(reports.societyId, societyId), activeStatus)
      : and(eq(reports.societyId, societyId), activeStatus, after);
    const rows = await this.executor
      .select()
      .from(reports)
      .where(where)
      .orderBy(asc(reports.createdAt), asc(reports.id))
      .limit(page.limit + 1);
    return pageResult(rows, page.limit);
  }

  async listAllReports(
    page: PageRequest,
    status?: ReportStatus,
  ): Promise<PageResult<ReportRecord>> {
    const after = page.cursor === undefined ? undefined : reportAfter(page.cursor, "desc");
    const statusFilter = status === undefined ? undefined : eq(reports.status, status);
    const where = and(statusFilter, after);
    const rows = await this.executor
      .select()
      .from(reports)
      .where(where)
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(page.limit + 1);
    return pageResult(rows, page.limit);
  }

  async findReport(reportId: string): Promise<ReportRecord | null> {
    return this.findReportInternal(reportId, false);
  }

  async findReportForUpdate(reportId: string): Promise<ReportRecord | null> {
    return this.findReportInternal(reportId, true);
  }

  async findActiveReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportRecord | null> {
    const target = targetType === "thread"
      ? eq(reports.threadId, targetId)
      : eq(reports.commentId, targetId);
    const rows = await this.executor
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, reporterId),
          or(eq(reports.status, "pending"), eq(reports.status, "in_review")),
          target,
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toReport(row);
  }

  async createReport(input: CreateReportInput): Promise<ReportRecord> {
    try {
      const values = {
        id: input.id,
        societyId: input.societyId,
        reporterId: input.reporterId,
        reason: input.reason,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
        ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
        ...(input.details === undefined ? {} : { details: input.details }),
      };
      const rows = await this.executor.insert(reports).values(values).returning();
      const row = rows[0];
      if (row === undefined) throw new ApplicationError("MODERATION_DATA_INVALID", "The report could not be created");
      return toReport(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError("CONFLICT", "You already have an active report for this content");
      }
      throw error;
    }
  }

  async claimPendingReport(
    reportId: string,
    moderatorId: string,
    updatedAt: Date,
  ): Promise<ReportRecord | null> {
    const rows = await this.executor
      .update(reports)
      .set({ status: "in_review", assignedTo: moderatorId, updatedAt })
      .where(and(eq(reports.id, reportId), eq(reports.status, "pending"), isNull(reports.assignedTo)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toReport(row);
  }

  async updateReport(reportId: string, input: UpdateReportInput): Promise<ReportRecord | null> {
    const rows = await this.executor
      .update(reports)
      .set({
        status: input.status,
        resolution: input.resolution,
        resolutionNote: input.resolutionNote,
        updatedAt: input.updatedAt,
        resolvedAt: input.resolvedAt,
        resolvedBy: input.resolvedBy,
      })
      .where(eq(reports.id, reportId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toReport(row);
  }

  async appendModerationAction(input: CreateModerationActionInput): Promise<ModerationActionRecord> {
    const rows = await this.executor.insert(moderationActions).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("MODERATION_DATA_INVALID", "The moderation action could not be recorded");
    }
    return toModerationAction(row);
  }

  async findThread(threadId: string): Promise<ThreadRecord | null> {
    return this.findThreadInternal(threadId, false);
  }

  async findThreadForUpdate(threadId: string): Promise<ThreadRecord | null> {
    return this.findThreadInternal(threadId, true);
  }

  async findCommentTarget(commentId: string): Promise<CommentTargetRecord | null> {
    return this.findCommentTargetInternal(commentId, false);
  }

  async findCommentTargetForUpdate(commentId: string): Promise<CommentTargetRecord | null> {
    return this.findCommentTargetInternal(commentId, true);
  }

  async softRemoveThread(threadId: string, updatedAt: Date): Promise<ThreadRecord | null> {
    const rows = await this.executor
      .update(threads)
      .set({ status: "removed", updatedAt })
      .where(and(eq(threads.id, threadId), or(eq(threads.status, "published"), eq(threads.status, "removed"))))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async softRemoveComment(commentId: string, updatedAt: Date): Promise<CommentRecord | null> {
    const rows = await this.executor
      .update(comments)
      .set({ status: "removed", updatedAt })
      .where(and(eq(comments.id, commentId), or(eq(comments.status, "published"), eq(comments.status, "removed"))))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toComment(row);
  }

  async findMembership(societyId: string, userId: string): Promise<MembershipRecord | null> {
    const rows = await this.executor
      .select()
      .from(societyMemberships)
      .where(and(eq(societyMemberships.societyId, societyId), eq(societyMemberships.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  async countActiveModerators(societyId: string): Promise<number> {
    const rows = await this.executor
      .select({ userId: societyMemberships.userId })
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.societyId, societyId),
          eq(societyMemberships.role, "moderator"),
          eq(societyMemberships.status, "active"),
        ),
      )
      .for("update");
    return rows.length;
  }

  async updateMembership(
    societyId: string,
    userId: string,
    input: UpdateModerationMembershipInput,
  ): Promise<MembershipRecord | null> {
    const values = {
      updatedAt: input.updatedAt,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.bannedBy === undefined ? {} : { bannedBy: input.bannedBy }),
      ...(input.bannedAt === undefined ? {} : { bannedAt: input.bannedAt }),
    };
    const rows = await this.executor
      .update(societyMemberships)
      .set(values)
      .where(and(eq(societyMemberships.societyId, societyId), eq(societyMemberships.userId, userId)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    const rows = await this.executor
      .select({ user: authUsers, profile: userProfiles })
      .from(authUsers)
      .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
      .where(eq(authUsers.id, userId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { user: toAuthUser(row.user), profile: toProfile(row.profile) };
  }

  async updateUserAccess(userId: string, input: UpdateModerationUserInput): Promise<UserProfileRecord> {
    const values = {
      updatedAt: input.updatedAt,
      ...(input.platformRole === undefined ? {} : { platformRole: input.platformRole }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.suspendedUntil === undefined ? {} : { suspendedUntil: input.suspendedUntil }),
    };
    const rows = await this.executor
      .update(userProfiles)
      .set(values)
      .where(eq(userProfiles.userId, userId))
      .returning();
    const row = rows[0];
    if (row === undefined) throw new ApplicationError("NOT_FOUND", "User was not found");
    return toProfile(row);
  }

  private async findReportInternal(reportId: string, lock: boolean): Promise<ReportRecord | null> {
    const query = this.executor.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    const rows = lock ? await query.for("update") : await query;
    const row = rows[0];
    return row === undefined ? null : toReport(row);
  }

  private async findThreadInternal(threadId: string, lock: boolean): Promise<ThreadRecord | null> {
    const query = this.executor.select().from(threads).where(eq(threads.id, threadId)).limit(1);
    const rows = lock ? await query.for("update") : await query;
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  private async findCommentTargetInternal(
    commentId: string,
    lock: boolean,
  ): Promise<CommentTargetRecord | null> {
    const query = this.executor
      .select({ comment: comments, thread: threads })
      .from(comments)
      .innerJoin(threads, eq(threads.id, comments.threadId))
      .where(eq(comments.id, commentId))
      .limit(1);
    const rows = lock ? await query.for("update") : await query;
    const row = rows[0];
    return row === undefined
      ? null
      : { comment: toComment(row.comment), thread: toThread(row.thread) };
  }
}

export class DrizzleModerationTransactionManager implements TransactionManager<ModerationRepository> {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(work: (transaction: ModerationRepository) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction(async (transaction) => work(new DrizzleModerationRepository(transaction)));
  }
}

function pageResult(
  rows: readonly (typeof reports.$inferSelect)[],
  limit: number,
): PageResult<ReportRecord> {
  const items = rows.slice(0, limit).map(toReport);
  const last = items.at(-1);
  const hasMore = rows.length > limit;
  return {
    items,
    hasMore,
    nextCursor: hasMore && last !== undefined
      ? encodeCursor(cursorFor(last.createdAt, last.id))
      : null,
  };
}

function reportAfter(encoded: string, direction: "asc" | "desc") {
  const cursor = decodeCursor(encoded);
  if (typeof cursor.value !== "string" || !isUuid(cursor.id)) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  const date = new Date(cursor.value);
  if (Number.isNaN(date.getTime())) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  return direction === "desc"
    ? or(
      lt(reports.createdAt, date),
      and(eq(reports.createdAt, date), lt(reports.id, cursor.id)),
    )
    : or(
      gt(reports.createdAt, date),
      and(eq(reports.createdAt, date), gt(reports.id, cursor.id)),
    );
}

function toReport(row: typeof reports.$inferSelect): ReportRecord {
  if ((row.threadId === null) === (row.commentId === null)) {
    throw new ApplicationError("MODERATION_DATA_INVALID", "The report has invalid target state");
  }
  return {
    id: row.id,
    societyId: row.societyId,
    reporterId: row.reporterId,
    threadId: row.threadId,
    commentId: row.commentId,
    reason: row.reason,
    details: row.details,
    status: assertReportStatus(row.status),
    assignedTo: row.assignedTo,
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  };
}

function toModerationAction(row: typeof moderationActions.$inferSelect): ModerationActionRecord {
  if (
    row.targetType !== "user" &&
    row.targetType !== "membership" &&
    row.targetType !== "thread" &&
    row.targetType !== "comment" &&
    row.targetType !== "report"
  ) {
    throw new ApplicationError("MODERATION_DATA_INVALID", "The moderation action has invalid target state");
  }
  return {
    id: row.id,
    societyId: row.societyId,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

function toThread(row: typeof threads.$inferSelect): ThreadRecord {
  const hasLocation = (row as unknown as { locationName: string | null }).locationName !== null && (row as unknown as { latitude: number | null }).latitude !== null;
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
    location: hasLocation ? { name: (row as unknown as { locationName: string }).locationName, mapboxId: (row as unknown as { locationMapboxId: string }).locationMapboxId, placeType: (row as unknown as { locationPlaceType: string | null }).locationPlaceType ?? null, latitude: (row as unknown as { latitude: number }).latitude, longitude: (row as unknown as { longitude: number }).longitude, address: (row as unknown as { locationAddress: Record<string, unknown> | null }).locationAddress ?? null, meta: (row as unknown as { locationMeta: Record<string, unknown> | null }).locationMeta ?? null } : null,
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

function toMembership(row: typeof societyMemberships.$inferSelect): MembershipRecord {
  return {
    societyId: row.societyId,
    userId: row.userId,
    role: assertMembershipRole(row.role),
    status: assertMembershipState(row.status),
    joinedAt: row.joinedAt,
    updatedAt: row.updatedAt,
    bannedBy: row.bannedBy,
    bannedAt: row.bannedAt,
  };
}

function toAuthUser(row: typeof authUsers.$inferSelect): AuthUserRecord {
  return { id: row.id, email: row.email, createdAt: row.createdAt };
}

function toProfile(row: typeof userProfiles.$inferSelect): UserProfileRecord {
  if (!isPlatformRole(row.platformRole) || !isUserStatus(row.status)) {
    throw new ApplicationError("IDENTITY_DATA_INVALID", "The account profile contains invalid state");
  }
  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    avatarMediaId: row.avatarMediaId,
    platformRole: row.platformRole,
    status: row.status,
    isPublic: row.isPublic,
    suspendedUntil: row.suspendedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isPlatformRole(value: string): value is PlatformRole {
  return value === "student" || value === "system_admin";
}

function isUserStatus(value: string): value is UserStatus {
  return value === "active" || value === "suspended" || value === "deactivated";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
