import type { PageRequest, PageResult } from "../../../shared/application/pagination.js";
import type {
  IdentityAccountRecord,
  PlatformRole,
  UserProfileRecord,
  UserStatus,
} from "../../identity/domain/identity.types.js";
import type { CommentRecord, ThreadRecord } from "../../discussions/domain/discussion.js";
import type { MembershipRecord, MembershipRole, MembershipStatus } from "../../societies/domain/membership.js";
import type {
  ModerationActionRecord,
  ReportRecord,
  ReportTargetType,
} from "../domain/moderation.js";

export interface CreateReportInput {
  readonly id: string;
  readonly societyId: string;
  readonly reporterId: string;
  readonly threadId?: string;
  readonly commentId?: string;
  readonly reason: string;
  readonly details?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateReportInput {
  readonly status: "resolved" | "dismissed";
  readonly resolution: string;
  readonly resolutionNote: string | null;
  readonly updatedAt: Date;
  readonly resolvedAt: Date;
  readonly resolvedBy: string;
}

export interface CreateModerationActionInput {
  readonly id: string;
  readonly societyId: string | null;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: ModerationActionRecord["targetType"];
  readonly targetId: string;
  readonly reason: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export interface CommentTargetRecord {
  readonly comment: CommentRecord;
  readonly thread: ThreadRecord;
}

export interface UpdateModerationMembershipInput {
  readonly status?: MembershipStatus;
  readonly role?: MembershipRole;
  readonly updatedAt: Date;
  readonly bannedBy?: string | null;
  readonly bannedAt?: Date | null;
}

export interface UpdateModerationUserInput {
  readonly platformRole?: PlatformRole;
  readonly status?: UserStatus;
  readonly suspendedUntil?: Date | null;
  readonly updatedAt: Date;
}

/**
 * The moderation unit of work deliberately contains only the cross-context operations
 * needed to resolve a report. The Drizzle adapter supplies the transaction instance.
 */
export interface ModerationRepository {
  listReporterReports(
    reporterId: string,
    page: PageRequest,
  ): Promise<PageResult<ReportRecord>>;
  listSocietyReports(
    societyId: string,
    page: PageRequest,
  ): Promise<PageResult<ReportRecord>>;
  findReport(reportId: string): Promise<ReportRecord | null>;
  findReportForUpdate(reportId: string): Promise<ReportRecord | null>;
  findActiveReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportRecord | null>;
  createReport(input: CreateReportInput): Promise<ReportRecord>;
  claimPendingReport(reportId: string, moderatorId: string, updatedAt: Date): Promise<ReportRecord | null>;
  updateReport(reportId: string, input: UpdateReportInput): Promise<ReportRecord | null>;
  appendModerationAction(input: CreateModerationActionInput): Promise<ModerationActionRecord>;

  findThread(threadId: string): Promise<ThreadRecord | null>;
  findThreadForUpdate(threadId: string): Promise<ThreadRecord | null>;
  findCommentTarget(commentId: string): Promise<CommentTargetRecord | null>;
  findCommentTargetForUpdate(commentId: string): Promise<CommentTargetRecord | null>;
  softRemoveThread(threadId: string, updatedAt: Date): Promise<ThreadRecord | null>;
  softRemoveComment(commentId: string, updatedAt: Date): Promise<CommentRecord | null>;

  findMembership(societyId: string, userId: string): Promise<MembershipRecord | null>;
  countActiveModerators(societyId: string): Promise<number>;
  updateMembership(
    societyId: string,
    userId: string,
    input: UpdateModerationMembershipInput,
  ): Promise<MembershipRecord | null>;

  findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null>;
  updateUserAccess(userId: string, input: UpdateModerationUserInput): Promise<UserProfileRecord>;
}
