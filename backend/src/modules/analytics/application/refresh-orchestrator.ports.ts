import type { Clock } from "../../../shared/application/clock";
import type { Logger } from "pino";
import type { MetricPayload, MetricType } from "../domain/analytics";
import type { AnalyticsRepository } from "./analytics.repository";

export type RefreshRunTrigger = "admin" | "nightly";

/**
 * Run lifecycle:
 *   requested → exporting (Glue job building S3 catalog) → querying (Athena)
 *   → completed. Any unfinished run may become "failed" once retry/stale
 *   limits are hit. Persisting happens during the querying→completed edge
 *   using the existing analytics repository port.
 */
export type RefreshRunStatus =
  | "requested"
  | "exporting"
  | "querying"
  | "completed"
  | "failed";

export interface RefreshRunRecord {
  readonly runId: string;
  readonly trigger: RefreshRunTrigger;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly status: RefreshRunStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly glueJobRunId: string | null;
  readonly athenaQueryExecutionIds: Readonly<Partial<Record<MetricType, string>>>;
}

/** Persistence contract for refresh runs, including restart recovery. */
export interface RefreshRunStore {
  findActiveRun(): Promise<RefreshRunRecord | null>;
  get(runId: string): Promise<RefreshRunRecord | null>;
  listUnfinishedRuns(): Promise<readonly RefreshRunRecord[]>;
  save(run: RefreshRunRecord): Promise<RefreshRunRecord>;
  /** Atomically acquires the processing lease for one unfinished run. */
  claim(
    runId: string,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null>;
  /** Saves only while this owner still holds the active-run lease. */
  saveClaimed(
    run: RefreshRunRecord,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null>;
}

export interface GlueJobStartInput {
  readonly runId: string;
  readonly arguments?: Readonly<Record<string, string>> | undefined;
}

export type GlueJobRunStatus =
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "SUCCEEDED"
  | "FAILED"
  | "ERROR"
  | "TIMEOUT"
  | "CANCELLED";

export interface GlueGateway {
  /** Adapters use the run argument to resolve replayed starts; Glue has no native idempotency token. */
  startJobRun(input: GlueJobStartInput): Promise<string>;
  getJobRunStatus(jobRunId: string): Promise<GlueJobRunStatus>;
}

export type AthenaQueryStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface AthenaQueryInput {
  readonly sql: string;
  readonly clientRequestToken: string;
  readonly outputLocation?: string | undefined;
}

/** One row of a finished metric-group query, shaped for the analytics repository. */
export interface AthenaMetricRow {
  readonly metricType: MetricType;
  readonly societyId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly data: MetricPayload;
}

/**
 * Expected adapter contract (ticket #9 owns the AWS SDK implementation backed
 * by @aws-sdk/client-athena): startQuery maps to StartQueryExecution passing
 * ClientRequestToken = clientRequestToken, getStatus maps to
 * GetQueryExecution → QueryExecution.Status.State, getResults maps to
 * GetQueryResults (or a paginator over ResultConfiguration.OutputLocation).
 */
export interface AthenaGateway {
  startQuery(input: AthenaQueryInput): Promise<string>;
  getStatus(queryExecutionId: string): Promise<AthenaQueryStatus>;
  getResults(queryExecutionId: string): Promise<readonly AthenaMetricRow[]>;
}

export type MetricSqlCatalog = Readonly<Partial<Record<MetricType, string>>>;
export type MetricSqlCatalogFactory = (snapshotId: string) => MetricSqlCatalog;

export interface RefreshOrchestratorOptions {
  readonly repository: AnalyticsRepository;
  readonly runStore: RefreshRunStore;
  readonly glueGateway?: GlueGateway | undefined;
  readonly athenaGateway?: AthenaGateway | undefined;
  readonly sqlByMetricType?: MetricSqlCatalogFactory | undefined;
  readonly clock?: Clock | undefined;
  readonly logger?: Logger | undefined;
  readonly maxPhaseRetries?: number | undefined;
  readonly staleAfterMs?: number | undefined;
  readonly leaseDurationMs?: number | undefined;
}
