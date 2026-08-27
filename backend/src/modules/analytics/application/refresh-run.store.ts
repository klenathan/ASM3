import type {
  RefreshRunRecord,
  RefreshRunStore,
} from "./refresh-orchestrator.ports";

const UNFINISHED_STATUSES = new Set(["requested", "exporting", "querying"]);

/** In-process implementation retained for focused orchestrator tests. */
export class InMemoryRefreshRunStore implements RefreshRunStore {
  private readonly runs = new Map<string, RefreshRunRecord>();
  private readonly leases = new Map<string, { ownerId: string; expiresAt: number }>();

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

  async claim(
    runId: string,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null> {
    const run = this.runs.get(runId);
    if (run === undefined || !UNFINISHED_STATUSES.has(run.status)) return null;
    const lease = this.leases.get(runId);
    if (lease !== undefined && lease.ownerId !== ownerId && lease.expiresAt > now.getTime()) return null;
    this.leases.set(runId, { ownerId, expiresAt: now.getTime() + leaseDurationMs });
    return run;
  }

  async saveClaimed(
    run: RefreshRunRecord,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null> {
    const lease = this.leases.get(run.runId);
    const current = this.runs.get(run.runId);
    if (
      lease === undefined ||
      lease.ownerId !== ownerId ||
      lease.expiresAt <= now.getTime() ||
      current === undefined ||
      !UNFINISHED_STATUSES.has(current.status)
    ) return null;
    this.leases.set(run.runId, { ownerId, expiresAt: now.getTime() + leaseDurationMs });
    this.runs.set(run.runId, run);
    return run;
  }
}
