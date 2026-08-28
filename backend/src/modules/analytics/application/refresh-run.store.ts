import type {
  RefreshRunRecord,
  RefreshRunStore,
} from "./refresh-run.ports";

const UNFINISHED_STATUS: Record<"requested" | "exporting" | "querying", true> = {
  requested: true,
  exporting: true,
  querying: true,
};

/** In-process implementation retained for focused workflow tests. */
export class InMemoryRefreshRunStore implements RefreshRunStore {
  private readonly runs = new Map<string, RefreshRunRecord>();

  async findActiveRun(): Promise<RefreshRunRecord | null> {
    return [...this.runs.values()].find((run) => UNFINISHED_STATUS[run.status as keyof typeof UNFINISHED_STATUS] === true) ?? null;
  }

  async findLatestRun(): Promise<RefreshRunRecord | null> {
    return [...this.runs.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0] ?? null;
  }

  async get(runId: string): Promise<RefreshRunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async save(run: RefreshRunRecord): Promise<RefreshRunRecord> {
    this.runs.set(run.runId, run);
    return run;
  }
}
