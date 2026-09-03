export type RefreshRunTrigger = "admin" | "nightly";

export type RefreshRunStatus =
  | "requested"
  | "exporting"
  | "querying"
  | "completed"
  | "failed"
  | "cancelled";

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
  readonly athenaQueryExecutionIds: Readonly<Partial<Record<string, string>>>;
}

/** Durable refresh records shared by the API and workflow callback Lambda. */
export interface RefreshRunStore {
  findActiveRun(): Promise<RefreshRunRecord | null>;
  findLatestRun(): Promise<RefreshRunRecord | null>;
  get(runId: string): Promise<RefreshRunRecord | null>;
  save(run: RefreshRunRecord): Promise<RefreshRunRecord>;
}

export interface AthenaActionMetricRow {
  readonly metricKind: "activity" | "current_state" | "reconciliation";
  readonly grain: "platform" | "society" | "content";
  readonly societyId: string | null;
  readonly targetType: "thread" | "comment" | null;
  readonly targetId: string | null;
  readonly threadId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly snapshotAt: Date | null;
  readonly data: Record<string, unknown>;
}

export interface AthenaGateway {
  getActionResults(queryExecutionId: string): Promise<readonly AthenaActionMetricRow[]>;
}
