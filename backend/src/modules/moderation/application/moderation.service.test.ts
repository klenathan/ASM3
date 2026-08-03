import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { IdentityAccountRecord, UserProfileRecord } from "../../identity/domain/identity.types";
import type { CommentRecord, ThreadRecord } from "../../discussions/domain/discussion";
import type { MembershipRecord } from "../../societies/domain/membership";
import type { SocietyRecord, SocietyRuleRecord } from "../../societies/domain/society";
import type {
  CreateModerationActionInput,
  CreateReportInput,
  ModerationRepository,
  UpdateModerationMembershipInput,
  UpdateModerationUserInput,
  UpdateReportInput,
} from "./moderation.repository";
import type { ModerationActionRecord, ReportRecord, ReportStatus } from "../domain/moderation";
import { ModerationService } from "./moderation.service";
import { ReportService } from "./report.service";
import type { CreateRuleInput, CreateSocietyInput, SocietyRepository, UpdateRuleInput, MembershipSocietyRecord } from "../../societies/application/society.repository";

const now = new Date("2026-01-02T00:00:00.000Z");
const clock: Clock = { now: () => now };
const society: SocietyRecord = {
  id: "society-id",
  slug: "cloud",
  name: "Cloud Computing",
  description: "Cloud Computing students",
  avatarMediaId: "00000000-0000-4000-8000-00000000000a",
  status: "active",
  createdBy: "admin-id",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const thread: ThreadRecord = {
  id: "thread-id",
  societyId: society.id,
  authorId: "author-id",
  title: "A thread",
  body: "Body",
  status: "published",
  score: 0,
  commentCount: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
const reporter: RequestPrincipal = { userId: "reporter-id", platformRole: "student" };
const moderator: RequestPrincipal = { userId: "moderator-id", platformRole: "student" };
const otherModerator: RequestPrincipal = { userId: "other-moderator-id", platformRole: "student" };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };

describe("ReportService", () => {
  it("requires one target, verifies its society, and prevents active duplicates", async () => {
    const repository = new FakeModerationRepository();
    const service = createReportService(repository);

    await expect(
      service.createReport(reporter, {
        societyId: society.id,
        reason: "Both targets",
        threadId: thread.id,
        commentId: "comment-id",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await service.createReport(reporter, {
      societyId: society.id,
      threadId: thread.id,
      reason: "Off topic",
    });
    expect(created).toMatchObject({ status: "pending", targetType: "thread", targetId: thread.id });

    await expect(
      service.createReport(reporter, {
        societyId: society.id,
        threadId: thread.id,
        reason: "Again",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      service.createReport(reporter, {
        societyId: "other-society-id",
        threadId: thread.id,
        reason: "Wrong society",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows retained removed content but not deleted content", async () => {
    const repository = new FakeModerationRepository();
    const service = createReportService(repository);
    repository.threads.set(thread.id, { ...thread, status: "removed" });

    await expect(
      service.createReport(reporter, { societyId: society.id, threadId: thread.id, reason: "Retained" }),
    ).resolves.toMatchObject({ status: "pending" });

    repository.threads.set(thread.id, { ...thread, status: "deleted" });
    await expect(
      service.createReport(otherModerator, { societyId: society.id, threadId: thread.id, reason: "Deleted" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ModerationService", () => {
  it("scopes the queue, conditionally claims once, and audits removal in the transaction", async () => {
    const repository = new FakeModerationRepository();
    const reportService = createReportService(repository);
    const service = createModerationService(repository);
    const report = await reportService.createReport(reporter, {
      societyId: society.id,
      threadId: thread.id,
      reason: "Needs review",
    });

    await expect(service.listSocietyReports(reporter, society.slug, { limit: 20 })).rejects.toMatchObject({
      code: "SOCIETY_FORBIDDEN",
    });
    await expect(service.listSocietyReports(admin, society.slug, { limit: 20 })).resolves.toMatchObject({
      items: [{ id: report.id }],
    });

    await expect(service.claimReport(moderator, report.id)).resolves.toMatchObject({
      status: "in_review",
      assignedTo: moderator.userId,
    });
    await expect(service.claimReport(otherModerator, report.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const resolved = await service.resolveReport(moderator, report.id, {
      action: "remove_content",
      resolutionNote: "Removed under society rules",
    });
    expect(resolved).toMatchObject({ status: "resolved", resolution: "remove_content" });
    expect(repository.threads.get(thread.id)?.status).toBe("removed");
    expect(repository.actions).toHaveLength(1);
    expect(repository.actions[0]).toMatchObject({
      action: "content_removed",
      targetType: "thread",
      targetId: thread.id,
    });
    expect(repository.transactionCalls).toBeGreaterThan(0);
  });

  it("applies a membership ban as part of report resolution", async () => {
    const repository = new FakeModerationRepository();
    const reportService = createReportService(repository);
    const service = createModerationService(repository);
    const report = await reportService.createReport(reporter, {
      societyId: society.id,
      threadId: thread.id,
      reason: "Abuse",
    });

    await service.claimReport(moderator, report.id);
    await service.resolveReport(moderator, report.id, { action: "ban_member" });

    expect(repository.memberships.get(`${society.id}:${thread.authorId}`)?.status).toBe("banned");
    expect(repository.actions[0]).toMatchObject({ action: "member_banned", targetType: "membership" });
  });

  it("restricts the global report queue to system admins", async () => {
    const repository = new FakeModerationRepository();
    const reportService = createReportService(repository);
    const service = createModerationService(repository);
    const report = await reportService.createReport(reporter, {
      societyId: society.id,
      threadId: thread.id,
      reason: "Global review",
    });

    await expect(service.listAllReports(reporter, { limit: 20 })).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
    await expect(service.listAllReports(admin, { limit: 20 })).resolves.toMatchObject({
      items: [{ id: report.id }],
    });
  });
});

function createReportService(repository: FakeModerationRepository): ReportService {
  return new ReportService({
    repository,
    societyRepository: new FakeSocietyRepository(),
    transactions: immediateTransaction(repository),
    clock,
  });
}

function createModerationService(repository: FakeModerationRepository): ModerationService {
  return new ModerationService({
    repository,
    societyRepository: new FakeSocietyRepository(),
    transactions: immediateTransaction(repository),
    clock,
  });
}

class FakeModerationRepository implements ModerationRepository {
  readonly reports = new Map<string, ReportRecord>();
  readonly threads = new Map<string, ThreadRecord>([[thread.id, thread]]);
  readonly comments = new Map<string, CommentRecord>();
  readonly memberships = new Map<string, MembershipRecord>([
    [membershipKey(society.id, thread.authorId), membership(thread.authorId, "member")],
    [membershipKey(society.id, moderator.userId), membership(moderator.userId, "moderator")],
    [membershipKey(society.id, otherModerator.userId), membership(otherModerator.userId, "moderator")],
  ]);
  readonly accounts = new Map<string, IdentityAccountRecord>([[thread.authorId, account(thread.authorId)]]);
  readonly actions: ModerationActionRecord[] = [];
  transactionCalls = 0;

  async listReporterReports(reporterId: string, _page: PageRequest): Promise<PageResult<ReportRecord>> {
    return page([...this.reports.values()].filter((item) => item.reporterId === reporterId));
  }

  async listSocietyReports(societyId: string, _page: PageRequest): Promise<PageResult<ReportRecord>> {
    return page([...this.reports.values()].filter(
      (item) => item.societyId === societyId && (item.status === "pending" || item.status === "in_review"),
    ));
  }

  async listAllReports(_page: PageRequest, status?: ReportStatus): Promise<PageResult<ReportRecord>> {
    const all = [...this.reports.values()];
    return page(status === undefined ? all : all.filter((item) => item.status === status));
  }

  async findReport(reportId: string): Promise<ReportRecord | null> { return this.reports.get(reportId) ?? null; }
  async findReportForUpdate(reportId: string): Promise<ReportRecord | null> { return this.findReport(reportId); }

  async findActiveReport(
    reporterId: string,
    targetType: "thread" | "comment",
    targetId: string,
  ): Promise<ReportRecord | null> {
    return [...this.reports.values()].find((item) =>
      item.reporterId === reporterId
      && (item.status === "pending" || item.status === "in_review")
      && (targetType === "thread" ? item.threadId === targetId : item.commentId === targetId),
    ) ?? null;
  }

  async createReport(input: CreateReportInput): Promise<ReportRecord> {
    const created: ReportRecord = {
      ...input,
      threadId: input.threadId ?? null,
      commentId: input.commentId ?? null,
      details: input.details ?? null,
      status: "pending",
      assignedTo: null,
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      resolvedBy: null,
    };
    this.reports.set(created.id, created);
    return created;
  }

  async claimPendingReport(reportId: string, moderatorId: string, updatedAt: Date): Promise<ReportRecord | null> {
    const current = this.reports.get(reportId);
    if (current === undefined || current.status !== "pending" || current.assignedTo !== null) return null;
    const claimed = { ...current, status: "in_review" as const, assignedTo: moderatorId, updatedAt };
    this.reports.set(reportId, claimed);
    return claimed;
  }

  async updateReport(reportId: string, input: UpdateReportInput): Promise<ReportRecord | null> {
    const current = this.reports.get(reportId);
    if (current === undefined) return null;
    const updated = { ...current, ...input };
    this.reports.set(reportId, updated);
    return updated;
  }

  async appendModerationAction(input: CreateModerationActionInput): Promise<ModerationActionRecord> {
    const action: ModerationActionRecord = { ...input };
    this.actions.push(action);
    return action;
  }

  async findThread(threadId: string): Promise<ThreadRecord | null> { return this.threads.get(threadId) ?? null; }
  async findThreadForUpdate(threadId: string): Promise<ThreadRecord | null> { return this.findThread(threadId); }

  async findCommentTarget(commentId: string) {
    const comment = this.comments.get(commentId);
    const parent = comment === undefined ? undefined : this.threads.get(comment.threadId);
    return comment === undefined || parent === undefined ? null : { comment, thread: parent };
  }

  async findCommentTargetForUpdate(commentId: string) { return this.findCommentTarget(commentId); }

  async softRemoveThread(threadId: string, updatedAt: Date): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null || current.status === "deleted") return null;
    const updated = { ...current, status: "removed" as const, updatedAt };
    this.threads.set(threadId, updated);
    return updated;
  }

  async softRemoveComment(commentId: string, updatedAt: Date): Promise<CommentRecord | null> {
    const current = this.comments.get(commentId);
    if (current === undefined || current.status === "deleted") return null;
    const updated = { ...current, status: "removed" as const, updatedAt };
    this.comments.set(commentId, updated);
    return updated;
  }

  async findMembership(societyId: string, userId: string): Promise<MembershipRecord | null> {
    return this.memberships.get(membershipKey(societyId, userId)) ?? null;
  }

  async countActiveModerators(societyId: string): Promise<number> {
    return [...this.memberships.values()].filter(
      (item) => item.societyId === societyId && item.role === "moderator" && item.status === "active",
    ).length;
  }

  async updateMembership(
    societyId: string,
    userId: string,
    input: UpdateModerationMembershipInput,
  ): Promise<MembershipRecord | null> {
    const current = await this.findMembership(societyId, userId);
    if (current === null) return null;
    const updated: MembershipRecord = { ...current, ...input };
    this.memberships.set(membershipKey(societyId, userId), updated);
    return updated;
  }

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    return this.accounts.get(userId) ?? null;
  }

  async updateUserAccess(userId: string, input: UpdateModerationUserInput): Promise<UserProfileRecord> {
    const current = this.accounts.get(userId);
    if (current === undefined) throw new Error("missing account");
    const profile = { ...current.profile, ...input };
    this.accounts.set(userId, { ...current, profile });
    return profile;
  }
}

class FakeSocietyRepository implements SocietyRepository {
  async findSocietyById(societyId: string): Promise<SocietyRecord | null> {
    return societyId === society.id ? society : null;
  }
  async listSocieties(_page: PageRequest): Promise<PageResult<SocietyRecord>> { return page([society]); }
  async listActiveMemberSocieties(_userId: string): Promise<readonly MembershipSocietyRecord[]> { return []; }
  async findSocietyBySlug(_slug: string): Promise<SocietyRecord | null> { return society; }
  async findSocietiesByIds(ids: readonly string[]): Promise<readonly SocietyRecord[]> {
    return ids.includes(society.id) ? [society] : [];
  }
  async createSociety(input: CreateSocietyInput): Promise<SocietyRecord> { return { ...input, status: "active" }; }
  async listRules(_societyId: string): Promise<readonly SocietyRuleRecord[]> { return []; }
  async findRuleById(_societyId: string, _ruleId: string): Promise<SocietyRuleRecord | null> { return null; }
  async createRule(input: CreateRuleInput): Promise<SocietyRuleRecord> { return input; }
  async updateRule(_societyId: string, _ruleId: string, _input: UpdateRuleInput): Promise<SocietyRuleRecord | null> { return null; }
  async deleteRule(_societyId: string, _ruleId: string): Promise<boolean> { return false; }
}

function membership(userId: string, role: "member" | "moderator"): MembershipRecord {
  return {
    societyId: society.id,
    userId,
    role,
    status: "active",
    joinedAt: now,
    updatedAt: now,
    bannedBy: null,
    bannedAt: null,
  };
}

function account(userId: string): IdentityAccountRecord {
  return {
    user: { id: userId, email: `${userId}@rmit.edu.au`, createdAt: now },
    profile: {
      userId,
      displayName: "Author",
      bio: null,
      avatarMediaId: null,
      platformRole: "student",
      status: "active",
      isPublic: true,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function membershipKey(societyId: string, userId: string): string {
  return `${societyId}:${userId}`;
}

function page<T>(items: readonly T[]): PageResult<T> {
  return { items, nextCursor: null, hasMore: false };
}

function immediateTransaction<T extends ModerationRepository>(repository: T): TransactionManager<T> {
  return {
    withTransaction: async (work) => {
      if ("transactionCalls" in repository && typeof repository.transactionCalls === "number") {
        repository.transactionCalls += 1;
      }
      return work(repository);
    },
  };
}
