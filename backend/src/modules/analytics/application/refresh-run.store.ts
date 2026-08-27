import type {
  RefreshRunRecord,
  RefreshRunStore,
} from "./refresh-orchestrator.ports";

const UNFINISHED_STATUSES = new Set(["requested", "exporting", "querying"]);

/**
 * In-process reference implementation of RefreshRunStore. Runs survive
 * between reconciler ticks but NOT process restarts; ticket #7 owns the
 * PostgreSQL-backed store. Idempotent resume after a restart relies on the
 * DB-backed implementation replaying unfinished runs, with AWS-side
 * dedupe (Glue idempotency token, Athena ClientRequestToken).
 */
export class InMemoryRefreshRunStore implements RefreshRunStore {
  private readonly runs = new Map<string, RefreshRunRecord>();

  async findActiveRun(): Promise<RefreshRunRecord | null> {
    for (const run of this.runs.values()) {
      if (UNFINISHED_STATUSES.has(run.status)) return run;
    }
    return null;
  }

  async get(runId: string): Promise<RefreshRunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async listUnfinishedRuns(): Promise<readonly RefreshRunRecord[]> {
    return [...this.runs.values()].filter((run) =>
      UNFINISHED_STATUSES.has(run.status),
    );
  }

  async save(run: RefreshRunRecord): Promise<RefreshRunRecord> {
    this.runs.set(run.runId, run);
    return run;
  }
}
