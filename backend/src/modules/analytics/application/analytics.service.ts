import type { Clock } from "../../../shared/application/clock";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { ApplicationError } from "../../../shared/domain/errors";
import type { IdentityRepository } from "../../identity/application/identity.repository";
import { assertSystemAdmin, assertTargetExists } from "../../identity/domain/access.policy";
import { normalizeRefreshRange, type RefreshRange } from "./refresh-range";
import type { ActionMetricsRepository, ActionMetricsQuery } from "./action-metrics.repository";
import type {
  ActionAnalyticsPageDto,
  ActionMetricDto,
  RefreshCancellationResponse,
  RefreshResponse,
  RefreshStatusDto,
} from "./analytics.dto";
import type { RefreshRunRecord, RefreshRunStore } from "./refresh-run.ports";
import type { RequestRefreshResult } from "./refresh-workflow";

export interface AnalyticsServiceDependencies {
  readonly actionMetricsRepository?: Pick<ActionMetricsRepository, "findActionMetrics" | "upsertActionMetrics"> & {
    getRecordingStartedAt?(contractVersion: 2): Promise<Date>;
  };
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly clock?: Clock | undefined;
  readonly onRefreshRequested?: ((range?: RefreshRange) => Promise<RequestRefreshResult | void>) | undefined;
  readonly runStore?: Pick<RefreshRunStore, "findLatestRun">
    & Partial<Pick<RefreshRunStore, "findActiveRun" | "get" | "save">>
    | undefined;
  readonly onRefreshCancelled?: ((run: RefreshRunRecord) => Promise<void>) | undefined;
  readonly onScheduledRefresh?: (() => Promise<RequestRefreshResult>) | undefined;
  readonly schedulerSecret?: string | undefined;
}

export class AnalyticsService {
  private readonly actionMetricsRepository:
    | AnalyticsServiceDependencies["actionMetricsRepository"]
    | undefined;
  private readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  private readonly runStore: AnalyticsServiceDependencies["runStore"];
  private readonly clock: Clock;
  private readonly onRefreshRequested: ((range?: RefreshRange) => Promise<RequestRefreshResult | void>) | undefined;
  private readonly onRefreshCancelled: ((run: RefreshRunRecord) => Promise<void>) | undefined;
  private readonly schedulerSecret: string | undefined;
  private readonly onScheduledRefresh: (() => Promise<RequestRefreshResult>) | undefined;

  constructor(dependencies: AnalyticsServiceDependencies) {
    this.actionMetricsRepository = dependencies.actionMetricsRepository;
    this.accountReader = dependencies.accountReader;
    this.runStore = dependencies.runStore;
    this.onRefreshRequested = dependencies.onRefreshRequested;
    this.onRefreshCancelled = dependencies.onRefreshCancelled;
    this.schedulerSecret = dependencies.schedulerSecret;
    this.clock = dependencies.clock ?? { now: () => new Date() };
    this.onScheduledRefresh = dependencies.onScheduledRefresh;
  }


  async refresh(principal: RequestPrincipal, range?: RefreshRange): Promise<RefreshResponse> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);

    const requestedRange = range === undefined
      ? undefined
      : normalizeRefreshRange(range, this.clock.now());
    let effectiveRange = requestedRange;
    let warnings: readonly string[] | undefined;

    if (requestedRange !== undefined && this.actionMetricsRepository?.getRecordingStartedAt !== undefined) {
      const recordingStartedAt = await this.actionMetricsRepository.getRecordingStartedAt(2);
      const firstAvailableDate = recordingStartedAt.toISOString().slice(0, 10);
      if (requestedRange.periodStart < firstAvailableDate) {
        warnings = [
          `Requested range starts before retained action events; skipped dates before ${firstAvailableDate}.`,
        ];
        if (firstAvailableDate >= requestedRange.periodEnd) {
          return {
            accepted: false,
            message: "No retained action events exist in the requested range; nothing was refreshed.",
            warnings,
          };
        }
        effectiveRange = {
          periodStart: firstAvailableDate,
          periodEnd: requestedRange.periodEnd,
        };
      }
    }

    const result = this.onRefreshRequested === undefined
      ? undefined
      : await this.onRefreshRequested(effectiveRange);

    return {
      accepted: result !== undefined,
      message: result === undefined
        ? "Analytics refresh orchestration is not configured; nothing was started."
        : result.coalesced
          ? "An analytics refresh run is already in progress."
          : "Analytics refresh has been queued.",
      ...(warnings === undefined ? {} : { warnings }),
      ...(result === undefined ? {} : {
        runId: result.runId,
        status: result.status,
        coalesced: result.coalesced,
        ...(result.periodStart === undefined ? {} : { periodStart: result.periodStart }),
        ...(result.periodEnd === undefined ? {} : { periodEnd: result.periodEnd }),
      }),
    };
  }

  async refreshStatus(principal: RequestPrincipal): Promise<RefreshStatusDto | null> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);
    const run = await this.runStore?.findLatestRun();
    return run === undefined || run === null ? null : toRefreshStatusDto(run);
  }

  async cancelLatestRefresh(principal: RequestPrincipal): Promise<RefreshCancellationResponse> {
    await this.requireSystemAdmin(principal);
    const runStore = this.runStore;
    if (runStore?.findActiveRun === undefined || runStore.save === undefined || this.onRefreshCancelled === undefined) {
      return {
        cancelled: false,
        message: "Analytics refresh cancellation is not configured.",
      };
    }
    const run = await runStore.findActiveRun();
    if (run === null) {
      return {
        cancelled: false,
        message: "No queued or running analytics refresh exists.",
      };
    }

    await this.onRefreshCancelled(run);
    const current = runStore.get === undefined ? run : await runStore.get(run.runId);
    if (
      current === null ||
      current === undefined ||
      (current.status !== "requested" && current.status !== "exporting" && current.status !== "querying")
    ) {
      return {
        cancelled: false,
        message: "The analytics refresh was no longer queued or running.",
        ...(current === null || current === undefined ? {} : { runId: current.runId, status: current.status }),
      };
    }

    const cancelled: RefreshRunRecord = {
      ...current,
      status: "cancelled",
      lastError: "Cancelled by a system administrator",
      updatedAt: this.clock.now(),
    };
    await runStore.save(cancelled);
    return {
      cancelled: true,
      message: "Analytics refresh was cancelled.",
      runId: cancelled.runId,
      status: cancelled.status,
    };
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
        accepted: false,
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
  async queryActionMetrics(
    principal: RequestPrincipal,
    query: ActionMetricsQuery,
  ): Promise<ActionAnalyticsPageDto> {
    await this.requireSystemAdmin(principal);
    const repository = this.actionMetricsRepository;
    if (repository === undefined) {
      return {
        contractVersion: 2,
        recordingStartedAt: this.clock.now().toISOString(),
        metrics: [],
        page: { cursor: null, hasMore: false },
      };
    }
    const result = await repository.findActionMetrics(query);
    const recordingStartedAt = repository.getRecordingStartedAt === undefined
      ? this.clock.now()
      : await repository.getRecordingStartedAt(2);
    const metrics = result.metrics.map((metric): ActionMetricDto => ({
      id: metric.id,
      source: "action_events",
      metricKind: metric.metricKind,
      grain: metric.grain,
      societyId: metric.societyId,
      targetType: metric.targetType,
      targetId: metric.targetId,
      threadId: metric.threadId,
      periodStart: metric.periodStart.toISOString(),
      periodEnd: metric.periodEnd.toISOString(),
      snapshotAt: metric.snapshotAt?.toISOString() ?? null,
      data: metric.data.data,
    }));
    return {
      contractVersion: 2,
      recordingStartedAt: recordingStartedAt.toISOString(),
      metrics,
      page: { cursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  async actionRefreshStatus(principal: RequestPrincipal, runId: string): Promise<RefreshStatusDto | null> {
    await this.requireSystemAdmin(principal);
    const run = this.runStore?.get === undefined ? null : await this.runStore.get(runId);
    return run === null || run === undefined ? null : toRefreshStatusDto(run);
  }


  private async requireSystemAdmin(principal: RequestPrincipal): Promise<void> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);
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
  readonly periodStart?: string;
  readonly periodEnd?: string;
}): RefreshStatusDto {
  return {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    attempts: run.attempts,
    lastError: run.lastError,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    ...(run.periodStart === undefined ? {} : { periodStart: run.periodStart }),
    ...(run.periodEnd === undefined ? {} : { periodEnd: run.periodEnd }),
  };
}
