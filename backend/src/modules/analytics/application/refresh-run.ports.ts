import type { MetricPayload, MetricType } from "../domain/analytics";

export type RefreshRunTrigger = "admin" | "nightly";

export type RefreshRunStatus =
  | "requested"
  | "exporting"
  | "querying"
  | "completed"
  | "failed";

export interface RefreshRunRecord {
  readonly runId: string;
  readonly trigger: RefreshRunTrigger;
  readonly contractVersion?: 2;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly status: RefreshRunStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly glueJobRunId: string | null;
  readonly athenaQueryExecutionIds: Readonly<Partial<Record<MetricType, string>>>;
}

/** Durable refresh records shared by the API and workflow callback Lambda. */
export interface RefreshRunStore {
  findActiveRun(): Promise<RefreshRunRecord | null>;
  findLatestRun(): Promise<RefreshRunRecord | null>;
  get(runId: string): Promise<RefreshRunRecord | null>;
  save(run: RefreshRunRecord): Promise<RefreshRunRecord>;
}

export interface AthenaMetricRow {
  readonly metricType: MetricType;
  readonly societyId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly data: MetricPayload;
}

export interface AthenaGateway {
  getResults(queryExecutionId: string): Promise<readonly AthenaMetricRow[]>;
}

export type MetricSqlCatalog = Readonly<Partial<Record<MetricType, string>>>;
export type MetricSqlCatalogFactory = (snapshotId: string) => MetricSqlCatalog;
