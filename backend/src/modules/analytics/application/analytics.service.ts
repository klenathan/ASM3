import type { Clock } from "../../../shared/application/clock";
import { normalizePageSize } from "../../../shared/application/pagination";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { assertSystemAdmin, assertTargetExists } from "../../identity/domain/access.policy";
import { ApplicationError } from "../../../shared/domain/errors";
import type { IdentityRepository } from "../../identity/application/identity.repository";
import type { MembershipRepository } from "../../societies/application/membership.repository";
import { isActiveModerator } from "../../societies/domain/membership";
import {
  AnalyticsForbiddenError,
  AnalyticsSocietyNotModeratedError,
} from "../domain/analytics.errors";
import type { AnalyticsRepository, AnalyticsQuery } from "./analytics.repository";
import {
  normalizeMetricPayload,
  type AnalyticsMetricRecord,
} from "../domain/analytics";
import type {
  AnalyticsMetricDto,
  AnalyticsPageDto,
  QueryMetricsRequest,
  RefreshResponse,
  RefreshStatusDto,
} from "./analytics.dto";
import type { RefreshRunStore } from "./refresh-run.ports";
import type { RequestRefreshResult } from "./refresh-workflow";

export interface AnalyticsServiceDependencies {
  readonly repository: AnalyticsRepository;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  readonly clock?: Clock | undefined;
  readonly runStore?: Pick<RefreshRunStore, "findLatestRun"> | undefined;
  readonly onRefreshRequested?: (() => Promise<RequestRefreshResult | void>) | undefined;
  readonly schedulerSecret?: string | undefined;
  readonly onScheduledRefresh?: (() => Promise<RequestRefreshResult>) | undefined;
}

export class AnalyticsService {
  private readonly repository: AnalyticsRepository;
  private readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  private readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  private readonly runStore: Pick<RefreshRunStore, "findLatestRun"> | undefined;
  private readonly onRefreshRequested: (() => Promise<RequestRefreshResult | void>) | undefined;
  private readonly schedulerSecret: string | undefined;
  private readonly onScheduledRefresh: (() => Promise<RequestRefreshResult>) | undefined;

  constructor(dependencies: AnalyticsServiceDependencies) {
    this.repository = dependencies.repository;
    this.accountReader = dependencies.accountReader;
    this.membershipRepository = dependencies.membershipRepository;
    this.runStore = dependencies.runStore;
    this.onRefreshRequested = dependencies.onRefreshRequested;
    this.schedulerSecret = dependencies.schedulerSecret;
    this.onScheduledRefresh = dependencies.onScheduledRefresh;
  }

  async queryMetrics(
    principal: RequestPrincipal,
    request: QueryMetricsRequest,
  ): Promise<AnalyticsPageDto> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);

    if (principal.platformRole === "system_admin") {
      // Admin: access all metrics, optional society filter
      const query: AnalyticsQuery = {
        metricType: request.metricType,
        societyId: request.societyId,
        limit: normalizePageSize(request.limit),
        cursor: request.cursor,
        periodStart: request.periodStart !== undefined ? new Date(request.periodStart) : undefined,
        periodEnd: request.periodEnd !== undefined ? new Date(request.periodEnd) : undefined,
      };

      const result = await this.repository.findMetrics(query);

      return {
        metrics: result.metrics.map(toDto),
        page: {
          cursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      };
    }

    // Non-admin: must be a moderator of the requested society
    if (request.societyId === undefined) {
      throw new AnalyticsForbiddenError();
    }

    const membership = await this.membershipRepository.findMembership(
      request.societyId,
      principal.userId,
    );
    if (!isActiveModerator(membership)) {
      throw new AnalyticsSocietyNotModeratedError();
    }

    const query: AnalyticsQuery = {
      metricType: request.metricType,
      societyId: request.societyId,
      limit: normalizePageSize(request.limit),
      cursor: request.cursor,
      periodStart: request.periodStart !== undefined ? new Date(request.periodStart) : undefined,
      periodEnd: request.periodEnd !== undefined ? new Date(request.periodEnd) : undefined,
    };

    const result = await this.repository.findMetrics(query);

    return {
      metrics: result.metrics.map(toDto),
      page: {
        cursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async refresh(principal: RequestPrincipal): Promise<RefreshResponse> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);

    const result = this.onRefreshRequested === undefined
      ? undefined
      : await this.onRefreshRequested();

    return {
      accepted: true,
      message: result === undefined
        ? "Analytics refresh orchestration is not configured; nothing was started."
        : result.coalesced
          ? "An analytics refresh run is already in progress."
          : "Analytics refresh has been queued.",
      ...(result === undefined ? {} : { runId: result.runId, status: result.status }),
    };
  }

  async refreshStatus(principal: RequestPrincipal): Promise<RefreshStatusDto | null> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);
    const run = await this.runStore?.findLatestRun();
    return run === undefined || run === null ? null : toRefreshStatusDto(run);
  }

  async scheduledRefresh(presentedSecret: string | undefined): Promise<RefreshResponse> {
    if (
      this.schedulerSecret === undefined ||
      presentedSecret === undefined ||
      !timingSafeEqualStrings(presentedSecret, this.schedulerSecret)
    ) {
      throw new ApplicationError("AUTH_REQUIRED", "A valid scheduler secret header is required");
    }

    if (this.onScheduledRefresh === undefined) {
      return {
        accepted: true,
        message: "Analytics refresh orchestration is not configured; nothing was started.",
      };
    }
    const result = await this.onScheduledRefresh();
    return {
      accepted: true,
      message: result.coalesced
        ? "An analytics refresh run is already in progress."
        : "Scheduled analytics refresh started.",
      runId: result.runId,
      status: result.status,
    };
  }
}

function timingSafeEqualStrings(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) {
    mismatch |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}
function toRefreshStatusDto(run: {
  readonly runId: string;
  readonly trigger: "admin" | "nightly";
  readonly status: RefreshStatusDto["status"];
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): RefreshStatusDto {
  return {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    attempts: run.attempts,
    lastError: run.lastError,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function toDto(record: AnalyticsMetricRecord): AnalyticsMetricDto {
  return {
    id: record.id,
    metricType: record.metricType,
    societyId: record.societyId,
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    data: normalizeMetricPayload(record.data),
  };
}
