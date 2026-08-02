import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock.js";
import { normalizePageSize, type PageRequest } from "../../../shared/application/pagination.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import { isActiveModerator, assertModeratorCanBeRemoved } from "../../societies/domain/membership.js";
import type { SocietyRepository } from "../../societies/application/society.repository.js";
import type {
  DismissReportCommand,
  ReportDto,
  ReportPageDto,
  ResolveReportCommand,
} from "./moderation.dto.js";
import { toReportDto, toReportPageDto } from "./moderation.mappers.js";
import type { ModerationRepository } from "./moderation.repository.js";
import {
  assertModerationResolution,
  isVisibleOrRetained,
  normalizeResolutionNote,
  type ModerationResolution,
  type ReportRecord,
} from "../domain/moderation.js";

export interface ModerationServiceDependencies {
  readonly repository: ModerationRepository;
  readonly societyRepository: SocietyRepository;
  readonly transactions: TransactionManager<ModerationRepository>;
  readonly clock: Clock;
}

export class ModerationService {
  private readonly repository: ModerationRepository;
  private readonly societyRepository: SocietyRepository;
  private readonly transactions: TransactionManager<ModerationRepository>;
  private readonly clock: Clock;

  constructor(dependencies: ModerationServiceDependencies) {
    this.repository = dependencies.repository;
    this.societyRepository = dependencies.societyRepository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
  }

  async getReport(principal: RequestPrincipal, reportId: string): Promise<ReportDto> {
    const report = await this.reportOrThrow(reportId);
    await this.assertAuthority(principal, report.societyId);
    return toReportDto(report);
  }

  async listSocietyReports(
    principal: RequestPrincipal,
    societyId: string,
    page: PageRequest,
  ): Promise<ReportPageDto> {
    await this.assertAuthority(principal, societyId);
    return toReportPageDto(
      await this.repository.listSocietyReports(societyId, normalizePage(page)),
    );
  }

  async claimReport(principal: RequestPrincipal, reportId: string): Promise<ReportDto> {
    const report = await this.reportOrThrow(reportId);
    await this.assertAuthority(principal, report.societyId);
    if (report.status !== "pending") {
      throw new ApplicationError("CONFLICT", "Only pending reports can be claimed");
    }

    const claimed = await this.transactions.withTransaction((repository) =>
      repository.claimPendingReport(reportId, principal.userId, this.clock.now()),
    );
    if (claimed !== null) return toReportDto(claimed);

    const current = await this.reportOrThrow(reportId);
    if (current.status !== "pending") {
      throw new ApplicationError("CONFLICT", "The report has already been claimed or resolved");
    }
    throw new ApplicationError("CONFLICT", "The report has already been claimed");
  }

  async resolveReport(
    principal: RequestPrincipal,
    reportId: string,
    command: ResolveReportCommand,
  ): Promise<ReportDto> {
    const report = await this.reportOrThrow(reportId);
    await this.assertAuthority(principal, report.societyId);
    const action = assertModerationResolution(command.action);
    const note = normalizeResolutionNote(command.resolutionNote);
    const suspendedUntil = command.suspendedUntil === undefined ? null : command.suspendedUntil;
    const now = this.clock.now();
    if (action === "suspend_user" && suspendedUntil !== null && suspendedUntil <= now) {
      throw new ApplicationError("INVALID_SUSPENSION", "Suspension expiry must be in the future");
    }
    this.assertCanResolve(report, principal);

    const resolved = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findReportForUpdate(reportId);
      if (locked === null) throw new ApplicationError("NOT_FOUND", "Report was not found");
      await this.assertAuthority(principal, locked.societyId);
      this.assertCanResolve(locked, principal);

      const target = await this.targetForUpdate(repository, locked);
      this.assertTargetSociety(target.societyId, locked.societyId);
      if (!isVisibleOrRetained(target.status)) {
        throw new ApplicationError("NOT_FOUND", "The reported content was not found");
      }

      const auditTarget = await this.applyResolution(
        repository,
        action,
        target,
        locked,
        principal,
        suspendedUntil,
        now,
      );
      const updated = await repository.updateReport(reportId, {
        status: "resolved",
        resolution: action,
        resolutionNote: note,
        updatedAt: now,
        resolvedAt: now,
        resolvedBy: principal.userId,
      });
      if (updated === null) throw new ApplicationError("NOT_FOUND", "Report was not found");

      await repository.appendModerationAction({
        id: randomUUID(),
        societyId: principal.platformRole === "system_admin" ? null : locked.societyId,
        actorId: principal.userId,
        action: auditTarget.action,
        targetType: auditTarget.targetType,
        targetId: auditTarget.targetId,
        reason: note ?? `Resolved report with ${action}`,
        metadata: { reportId: locked.id, resolution: action },
        createdAt: now,
      });
      return updated;
    });

    return toReportDto(resolved);
  }

  async dismissReport(
    principal: RequestPrincipal,
    reportId: string,
    command: DismissReportCommand = {},
  ): Promise<ReportDto> {
    const report = await this.reportOrThrow(reportId);
    await this.assertAuthority(principal, report.societyId);
    const note = normalizeResolutionNote(command.resolutionNote);
    this.assertCanResolve(report, principal);
    const now = this.clock.now();

    const dismissed = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findReportForUpdate(reportId);
      if (locked === null) throw new ApplicationError("NOT_FOUND", "Report was not found");
      this.assertCanResolve(locked, principal);
      const updated = await repository.updateReport(reportId, {
        status: "dismissed",
        resolution: "dismissed",
        resolutionNote: note,
        updatedAt: now,
        resolvedAt: now,
        resolvedBy: principal.userId,
      });
      if (updated === null) throw new ApplicationError("NOT_FOUND", "Report was not found");

      await repository.appendModerationAction({
        id: randomUUID(),
        societyId: principal.platformRole === "system_admin" ? null : locked.societyId,
        actorId: principal.userId,
        action: "report_dismissed",
        targetType: "report",
        targetId: locked.id,
        reason: note ?? "Dismissed report",
        metadata: {},
        createdAt: now,
      });
      return updated;
    });

    return toReportDto(dismissed);
  }

  private async assertAuthority(principal: RequestPrincipal, societyId: string): Promise<void> {
    const society = await this.societyRepository.findSocietyById(societyId);
    if (society === null) throw new ApplicationError("NOT_FOUND", "Society was not found");
    if (principal.platformRole === "system_admin") return;

    const membership = await this.repository.findMembership(societyId, principal.userId);
    if (!isActiveModerator(membership)) {
      throw new ApplicationError("SOCIETY_FORBIDDEN", "You cannot moderate this society");
    }
  }

  private assertCanResolve(report: ReportRecord, principal: RequestPrincipal): void {
    if (report.status !== "pending" && report.status !== "in_review") {
      throw new ApplicationError("CONFLICT", "The report has already been resolved");
    }
    if (
      principal.platformRole !== "system_admin" &&
      (report.status === "pending" || report.assignedTo !== principal.userId)
    ) {
      throw new ApplicationError("CONFLICT", "Claim the report before resolving it");
    }
  }

  private async reportOrThrow(reportId: string): Promise<ReportRecord> {
    const report = await this.repository.findReport(reportId);
    if (report === null) throw new ApplicationError("NOT_FOUND", "Report was not found");
    return report;
  }

  private async targetForUpdate(repository: ModerationRepository, report: ReportRecord): Promise<{
    readonly status: "published" | "removed" | "deleted";
    readonly societyId: string;
    readonly authorId: string;
    readonly targetType: "thread" | "comment";
    readonly targetId: string;
  }> {
    if (report.threadId !== null) {
      const thread = await repository.findThreadForUpdate(report.threadId);
      if (thread === null) throw new ApplicationError("NOT_FOUND", "The reported thread was not found");
      return {
        status: thread.status,
        societyId: thread.societyId,
        authorId: thread.authorId,
        targetType: "thread",
        targetId: thread.id,
      };
    }
    if (report.commentId !== null) {
      const target = await repository.findCommentTargetForUpdate(report.commentId);
      if (target === null) throw new ApplicationError("NOT_FOUND", "The reported comment was not found");
      return {
        status: target.comment.status,
        societyId: target.thread.societyId,
        authorId: target.comment.authorId,
        targetType: "comment",
        targetId: target.comment.id,
      };
    }
    throw new ApplicationError("MODERATION_DATA_INVALID", "The report has no target");
  }

  private assertTargetSociety(targetSocietyId: string, reportSocietyId: string): void {
    if (targetSocietyId !== reportSocietyId) {
      throw new ApplicationError("CONFLICT", "The report target does not belong to its society");
    }
  }

  private async applyResolution(
    repository: ModerationRepository,
    action: ModerationResolution,
    target: Awaited<ReturnType<ModerationService["targetForUpdate"]>>,
    report: ReportRecord,
    principal: RequestPrincipal,
    suspendedUntil: Date | null,
    now: Date,
  ): Promise<{
    readonly action: string;
    readonly targetType: "user" | "membership" | "thread" | "comment";
    readonly targetId: string;
  }> {
    if (action === "remove_content") {
      const removed = target.targetType === "thread"
        ? await repository.softRemoveThread(target.targetId, now)
        : await repository.softRemoveComment(target.targetId, now);
      if (removed === null) throw new ApplicationError("NOT_FOUND", "The reported content was not found");
      return { action: "content_removed", targetType: target.targetType, targetId: target.targetId };
    }

    if (action === "ban_member") {
      const membership = await repository.findMembership(report.societyId, target.authorId);
      if (membership === null) {
        throw new ApplicationError("NOT_FOUND", "The reported author is not a society member");
      }
      if (membership.status === "active" && membership.role === "moderator") {
        assertModeratorCanBeRemoved(await repository.countActiveModerators(report.societyId));
      }
      const updated = await repository.updateMembership(report.societyId, target.authorId, {
        status: "banned",
        updatedAt: now,
        bannedBy: principal.userId,
        bannedAt: now,
      });
      if (updated === null) throw new ApplicationError("NOT_FOUND", "The society membership was not found");
      return { action: "member_banned", targetType: "membership", targetId: target.authorId };
    }

    const account = await repository.findAccountByUserId(target.authorId);
    if (account === null) throw new ApplicationError("NOT_FOUND", "The reported author was not found");
    await repository.updateUserAccess(target.authorId, {
      status: "suspended",
      suspendedUntil,
      updatedAt: now,
    });
    return { action: "user_suspended", targetType: "user", targetId: target.authorId };
  }
}

function normalizePage(page: PageRequest): PageRequest {
  const limit = normalizePageSize(page.limit);
  return page.cursor === undefined ? { limit } : { limit, cursor: page.cursor };
}
