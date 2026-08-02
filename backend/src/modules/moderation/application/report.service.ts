import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import { normalizePageSize, type PageRequest } from "../../../shared/application/pagination";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { SocietyRepository } from "../../societies/application/society.repository";
import type { CommentTargetRecord, CreateReportInput, ModerationRepository } from "./moderation.repository";
import {
  assertExactlyOneTarget,
  isVisibleOrRetained,
  normalizeReportDetails,
  normalizeReportReason,
} from "../domain/moderation";
import type { CreateReportCommand, ReportDto, ReportPageDto } from "./moderation.dto";
import { toReportDto, toReportPageDto } from "./moderation.mappers";

export interface ReportServiceDependencies {
  readonly repository: ModerationRepository;
  readonly societyRepository: SocietyRepository;
  readonly transactions: TransactionManager<ModerationRepository>;
  readonly clock: Clock;
}

export class ReportService {
  private readonly repository: ModerationRepository;
  private readonly societyRepository: SocietyRepository;
  private readonly transactions: TransactionManager<ModerationRepository>;
  private readonly clock: Clock;

  constructor(dependencies: ReportServiceDependencies) {
    this.repository = dependencies.repository;
    this.societyRepository = dependencies.societyRepository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
  }

  async createReport(
    principal: RequestPrincipal,
    command: CreateReportCommand,
  ): Promise<ReportDto> {
    const targetType = assertExactlyOneTarget(command.threadId, command.commentId);
    const society = await this.societyRepository.findSocietyById(command.societyId);
    if (society === null) {
      throw new ApplicationError("NOT_FOUND", "Society was not found");
    }

    const reason = normalizeReportReason(command.reason);
    const details = normalizeReportDetails(command.details);
    const now = this.clock.now();
    const inputBase = {
      id: randomUUID(),
      societyId: society.id,
      reporterId: principal.userId,
      reason,
      createdAt: now,
      updatedAt: now,
      ...(details === undefined ? {} : { details }),
    };

    const report = await this.transactions.withTransaction(async (repository) => {
      const target = targetType === "thread"
        ? await this.threadTarget(repository, command.threadId as string)
        : await this.commentTarget(repository, command.commentId as string);
      this.assertReportableTarget(target, society.id);

      const targetId = targetType === "thread"
        ? (command.threadId as string)
        : (command.commentId as string);
      const duplicate = await repository.findActiveReport(principal.userId, targetType, targetId);
      if (duplicate !== null) {
        throw new ApplicationError("CONFLICT", "You already have an active report for this content");
      }

      const input: CreateReportInput = targetType === "thread"
        ? { ...inputBase, threadId: targetId }
        : { ...inputBase, commentId: targetId };
      return repository.createReport(input);
    });

    return toReportDto(report);
  }

  async listReporterReports(
    principal: RequestPrincipal,
    page: PageRequest,
  ): Promise<ReportPageDto> {
    return toReportPageDto(
      await this.repository.listReporterReports(principal.userId, normalizePage(page)),
    );
  }

  private async threadTarget(repository: ModerationRepository, threadId: string) {
    const thread = await repository.findThreadForUpdate(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "The reported thread was not found");
    }
    return thread;
  }

  private async commentTarget(
    repository: ModerationRepository,
    commentId: string,
  ): Promise<CommentTargetRecord> {
    const target = await repository.findCommentTargetForUpdate(commentId);
    if (target === null) {
      throw new ApplicationError("NOT_FOUND", "The reported comment was not found");
    }
    return target;
  }

  private assertReportableTarget(
    target: Awaited<ReturnType<ReportService["threadTarget"]>> | CommentTargetRecord,
    societyId: string,
  ): void {
    const content = "comment" in target ? target.comment : target;
    const society = "comment" in target ? target.thread.societyId : target.societyId;
    const parentStatus = "comment" in target ? target.thread.status : undefined;
    if (
      society !== societyId ||
      !isVisibleOrRetained(content.status) ||
      (parentStatus !== undefined && !isVisibleOrRetained(parentStatus))
    ) {
      throw new ApplicationError("NOT_FOUND", "The reported content was not found");
    }
  }
}

function normalizePage(page: PageRequest): PageRequest {
  const limit = normalizePageSize(page.limit);
  return page.cursor === undefined ? { limit } : { limit, cursor: page.cursor };
}
