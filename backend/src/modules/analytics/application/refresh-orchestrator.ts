import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import type { Logger } from "pino";
import type {
  AnalyticsRepository,
  UpsertAnalyticsMetricInput,
} from "./analytics.repository";
import { METRIC_TYPES, type MetricType } from "../domain/analytics";
import type {
  AthenaGateway,
  GlueGateway,
  GlueJobRunStatus,
  MetricSqlCatalog,
  RefreshOrchestratorOptions,
  RefreshRunRecord,
  RefreshRunStatus,
  RefreshRunStore,
  RefreshRunTrigger,
} from "./refresh-orchestrator.ports";
import type { AthenaQueryStatus } from "./refresh-orchestrator.ports";

const ACTIVE_STATUSES: readonly RefreshRunStatus[] = [
  "requested",
  "exporting",
  "querying",
];

const TERMINAL_GLUE_STATUSES = new Set<GlueJobRunStatus>([
  "SUCCEEDED",
  "FAILED",
  "ERROR",
  "TIMEOUT",
  "CANCELLED",
]);

const PENDING_ATHENA_STATUSES = new Set<AthenaQueryStatus>([
  "QUEUED",
  "RUNNING",
]);

const FAILED_ATHENA_STATUSES = new Set<AthenaQueryStatus>([
  "FAILED",
  "CANCELLED",
]);

export interface RequestRefreshResult {
  readonly runId: string;
  readonly coalesced: boolean;
}

/**
 * Owns one analytics refresh pipeline lifecycle: RDS→S3 export via Glue,
 * per-metric-group Athena queries, and persistence through the existing
 * analytics repository. Both admin-initiated and nightly triggers funnel
 * through requestRefresh and are coalesced onto at most one active run.
 */
export class AnalyticsRefreshOrchestrator {
  private readonly repository: AnalyticsRepository;
  private readonly runStore: RefreshRunStore;
  private readonly glueGateway: GlueGateway | undefined;
  private readonly athenaGateway: AthenaGateway | undefined;
  private readonly sqlByMetricType: MetricSqlCatalog | undefined;
  private readonly clock: Clock;
  private readonly logger: Logger | undefined;
  private readonly maxPhaseRetries: number;
  private readonly staleAfterMs: number;
  private readonly inFlight = new Set<string>();
  private refreshRequestLock = Promise.resolve();

  constructor(options: RefreshOrchestratorOptions) {
    this.repository = options.repository;
    this.runStore = options.runStore;
    this.glueGateway = options.glueGateway;
    this.athenaGateway = options.athenaGateway;
    this.sqlByMetricType = options.sqlByMetricType;
    this.clock = options.clock ?? { now: () => new Date() };
    this.logger = options.logger;
    this.maxPhaseRetries = options.maxPhaseRetries ?? 3;
    this.staleAfterMs = options.staleAfterMs ?? 45 * 60 * 1000;
  }

  get isConfigured(): boolean {
    return this.glueGateway !== undefined && this.athenaGateway !== undefined;
  }

  async requestRefresh(trigger: RefreshRunTrigger): Promise<RequestRefreshResult> {
    const previousRequest = this.refreshRequestLock;
    let releaseRequest: (() => void) | undefined;
    this.refreshRequestLock = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await previousRequest;

    try {
      return await this.createRefreshRun(trigger);
    } finally {
      releaseRequest?.();
    }
  }

  private async createRefreshRun(trigger: RefreshRunTrigger): Promise<RequestRefreshResult> {
    const existing = await this.runStore.findActiveRun();
    if (existing !== null && !this.isStale(existing)) {
      return { runId: existing.runId, coalesced: true };
    }

    const now = this.clock.now();
    let run: RefreshRunRecord = {
      runId: randomUUID(),
      trigger,
      createdAt: now,
      updatedAt: now,
      status: "requested",
      attempts: 0,
      lastError: null,
      glueJobRunId: null,
      athenaQueryExecutionIds: {},
    };
    run = await this.runStore.save(run);

    try {
      await this.startGlueExport(run);
    } catch (error) {
      // Keep the run non-terminal; the reconciler retries the export start
      // up to maxPhaseRetries before failing the run.
      await this.recordTransientError(run, error);
    }
    return { runId: run.runId, coalesced: false };
  }

  async reconcile(): Promise<void> {
    const runs = await this.runStore.listUnfinishedRuns();
    for (const run of runs) {
      if (this.inFlight.has(run.runId)) continue;
      this.inFlight.add(run.runId);
      try {
        if (this.isStale(run)) {
          await this.markFailed(run, "run exceeded stale threshold");
          continue;
        }
        switch (run.status) {
          case "requested":
            await this.retryGlueStart(run);
            break;
          case "exporting":
            await this.pollGlue(run);
            break;
          case "querying":
            await this.pollAthena(run);
            break;
          default:
            break;
        }
      } catch (error) {
        await this.recordTransientError(
          (await this.runStore.get(run.runId)) ?? run,
          error,
        );
        this.logger?.warn(
          { err: error, runId: run.runId },
          "analytics refresh reconcile tick failed",
        );
      } finally {
        this.inFlight.delete(run.runId);
      }
    }
  }

  private async retryGlueStart(run: RefreshRunRecord): Promise<void> {
    if (run.glueJobRunId === null) {
      if (run.attempts >= this.maxPhaseRetries) {
        await this.markFailed(run, "glue export start exceeded retry limit");
        return;
      }
      const current = (await this.runStore.get(run.runId)) ?? run;
      if (!ACTIVE_STATUSES.includes(current.status)) return;
      await this.startGlueExport(current);
      return;
    }
    await this.pollGlue({ ...run });
  }

  private async startGlueExport(run: RefreshRunRecord): Promise<void> {
    if (this.glueGateway === undefined) {
      throw new Error("analytics refresh orchestration is not configured");
    }
    const jobRunId = await this.glueGateway.startJobRun({
      runId: run.runId,
      arguments: {
        "--refresh-run-id": run.runId,
        "--output-prefix": `analytics/staging/${run.runId}`,
      },
    });
    await this.updateRun(run, {
      status: "exporting",
      glueJobRunId: jobRunId,
      lastError: null,
    });
  }

  private async pollGlue(run: RefreshRunRecord): Promise<void> {
    if (
      this.glueGateway === undefined ||
      run.glueJobRunId === null
    ) {
      await this.updateRun(run, { status: "requested", glueJobRunId: null });
      return;
    }
    const status = await this.glueGateway.getJobRunStatus(run.glueJobRunId);
    if (!TERMINAL_GLUE_STATUSES.has(status)) return;

    if (status === "SUCCEEDED") {
      await this.updateRun(run, {
        status: "querying",
        attempts: 0,
        lastError: null,
      });
      await this.pollAthena((await this.requireRun(run.runId)));
      return;
    }

    if (run.attempts < this.maxPhaseRetries) {
      await this.updateRun(run, {
        status: "requested",
        glueJobRunId: null,
        attempts: run.attempts + 1,
        lastError: `glue export ended with ${status}`,
      });
      return;
    }
    await this.markFailed(run, `glue export ended permanently with ${status}`);
  }

  private async pollAthena(run: RefreshRunRecord): Promise<void> {
    if (this.athenaGateway === undefined) {
      throw new Error("analytics refresh orchestration is not configured");
    }
    const sqlByMetricType = this.requiredSqlCatalog();

    let current = run;
    for (const metricType of Object.keys(sqlByMetricType) as MetricType[]) {
      if (current.athenaQueryExecutionIds[metricType] !== undefined) continue;
      const queryExecutionId = await this.athenaGateway.startQuery({
        sql: sqlByMetricType[metricType]!,
        clientRequestToken: `${current.runId}:${metricType}`,
      });
      current = await this.updateRun(current, {
        athenaQueryExecutionIds: {
          ...current.athenaQueryExecutionIds,
          [metricType]: queryExecutionId,
        },
      });
    }

    const statuses = new Map<MetricType, AthenaQueryStatus>();
    for (const [metricType, queryExecutionId] of Object.entries(
      current.athenaQueryExecutionIds,
    ) as [MetricType, string][]) {
      statuses.set(metricType, await this.athenaGateway.getStatus(queryExecutionId));
    }

    const anyRunning = [...statuses.values()].some((status) =>
      PENDING_ATHENA_STATUSES.has(status),
    );
    if (anyRunning) return;

    const failedGroups = [...statuses.entries()].filter(([_, status]) =>
      FAILED_ATHENA_STATUSES.has(status),
    );

    if (failedGroups.length > 0) {
      if (current.attempts < this.maxPhaseRetries) {
        const retained: Partial<Record<MetricType, string>> = {};
        for (const [metricType, status] of statuses) {
          if (!FAILED_ATHENA_STATUSES.has(status)) {
            retained[metricType] = current.athenaQueryExecutionIds[metricType]!;
          }
        }
        await this.updateRun(current, {
          attempts: current.attempts + 1,
          athenaQueryExecutionIds: retained,
          lastError: `athena metric group(s) ended with ${failedGroups.map(([t]) => t).join(",")}`,
        });
        return;
      }
      await this.markFailed(current, "athena queries exceeded retry limit");
      return;
    }

    const rows = [];
    for (const queryExecutionId of Object.values(
      current.athenaQueryExecutionIds,
    )) {
      rows.push(...(await this.athenaGateway.getResults(queryExecutionId!)));
    }
    const now = this.clock.now();
    await this.repository.upsertMetrics(rows.map((row) => ({
        id: randomUUID(),
        metricType: row.metricType,
        societyId: row.societyId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        data: row.data,
        createdAt: now,
        updatedAt: now,
      } satisfies UpsertAnalyticsMetricInput)));
    await this.updateRun(current, {
      status: "completed",
      lastError: null,
    });
    this.logger?.info(
      { runId: current.runId, persistedMetrics: rows.length },
      "analytics refresh run completed",
    );
  }

  private requiredSqlCatalog(): Record<MetricType, string> {
    if (this.sqlByMetricType === undefined) {
      throw new Error("no Athena SQL catalog configured for analytics refresh");
    }
    const missing = METRIC_TYPES.filter((metricType) => this.sqlByMetricType?.[metricType] === undefined);
    if (missing.length > 0) {
      throw new Error(`Athena SQL catalog is missing metric group(s): ${missing.join(", ")}`);
    }
    return this.sqlByMetricType as Record<MetricType, string>;
  }

  private isStale(run: RefreshRunRecord): boolean {
    return this.clock.now().getTime() - run.updatedAt.getTime() > this.staleAfterMs;
  }

  private async recordTransientError(
    run: RefreshRunRecord,
    error: unknown,
  ): Promise<void> {
    const attempts = run.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    if (attempts >= this.maxPhaseRetries) {
      await this.updateRun(run, {
        status: "failed",
        attempts,
        lastError: `${message}; retry limit exceeded`,
      });
      return;
    }
    await this.updateRun(run, { attempts, lastError: message });
  }

  private async markFailed(run: RefreshRunRecord, reason: string): Promise<void> {
    await this.updateRun(run, { status: "failed", lastError: reason });
    this.logger?.warn(
      { runId: run.runId, reason },
      "analytics refresh run failed",
    );
  }

  private async updateRun(
    run: RefreshRunRecord,
    patch: Partial<Omit<RefreshRunRecord, "runId" | "createdAt" | "trigger">>,
  ): Promise<RefreshRunRecord> {
    const updated: RefreshRunRecord = {
      ...run,
      ...patch,
      updatedAt: this.clock.now(),
    };
    return this.runStore.save(updated);
  }

  private async requireRun(runId: string): Promise<RefreshRunRecord> {
    const run = await this.runStore.get(runId);
    if (run === null) throw new Error(`analytics refresh run ${runId} disappeared`);
    return run;
  }
}
