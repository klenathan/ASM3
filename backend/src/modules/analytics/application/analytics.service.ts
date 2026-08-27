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
} from "./analytics.dto";

export interface AnalyticsServiceDependencies {
  readonly repository: AnalyticsRepository;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  readonly clock?: Clock | undefined;
  readonly onRefreshRequested?: (() => Promise<void>) | undefined;
  readonly schedulerSecret?: string | undefined;
  readonly onScheduledRefresh?: (() => Promise<{ accepted: boolean; message: string }>) | undefined;
}

export class AnalyticsService {
  private readonly repository: AnalyticsRepository;
  private readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  private readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  private readonly onRefreshRequested: (() => Promise<void>) | undefined;
  private readonly schedulerSecret: string | undefined;
  private readonly onScheduledRefresh: (() => Promise<{ accepted: boolean; message: string }>) | undefined;

  constructor(dependencies: AnalyticsServiceDependencies) {
    this.repository = dependencies.repository;
    this.accountReader = dependencies.accountReader;
    this.membershipRepository = dependencies.membershipRepository;
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

    if (this.onRefreshRequested !== undefined) {
      await this.onRefreshRequested();
    }

    return {
      accepted: true,
      message: "Analytics refresh has been queued. Results will be available in a few minutes.",
    };
  }

  async scheduledRefresh(presentedSecret: string | undefined): Promise<{ accepted: boolean; message: string }> {
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
    return this.onScheduledRefresh();
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
