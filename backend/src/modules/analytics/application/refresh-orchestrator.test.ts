import { beforeEach, describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type {
  AnalyticsMetricRecord,
} from "../domain/analytics";
import type {
  AnalyticsPageResult,
  AnalyticsQuery,
  AnalyticsRepository,
  UpsertAnalyticsMetricInput,
} from "./analytics.repository";
import { AnalyticsRefreshOrchestrator } from "./refresh-orchestrator";
import type {
  AthenaGateway,
  AthenaMetricRow,
  AthenaQueryInput,
  AthenaQueryStatus,
  GlueGateway,
  GlueJobRunStatus,
  RefreshRunRecord,
  RefreshRunStore,
} from "./refresh-orchestrator.ports";
import { InMemoryRefreshRunStore } from "./refresh-run.store";

class FakeAnalyticsRepository implements AnalyticsRepository {
  readonly upserts: UpsertAnalyticsMetricInput[] = [];

  async findMetrics(_query: AnalyticsQuery): Promise<AnalyticsPageResult> {
    return { metrics: [], nextCursor: null, hasMore: false };
  }

  async upsertMetric(
    input: UpsertAnalyticsMetricInput,
  ): Promise<AnalyticsMetricRecord> {
    this.upserts.push(input);
    return {
      ...input,
      id: input.id,
    } as AnalyticsMetricRecord;
  }

  async upsertMetrics(
    inputs: readonly UpsertAnalyticsMetricInput[],
  ): Promise<readonly AnalyticsMetricRecord[]> {
    const records: AnalyticsMetricRecord[] = [];
    for (const input of inputs) records.push(await this.upsertMetric(input));
    return records;
  }

  async findLatestPeriod(): Promise<Date | null> {
    return null;
  }
}

class FakeGlueGateway implements GlueGateway {
  startCalls = 0;
  failStarts = false;
  statuses = new Map<string, GlueJobRunStatus>();

  async startJobRun(input: { readonly runId: string }): Promise<string> {
    this.startCalls++;
    if (this.failStarts) throw new Error("glue unavailable");
    return `jobrun-${input.runId}`;
  }

  async getJobRunStatus(jobRunId: string): Promise<GlueJobRunStatus> {
    return this.statuses.get(jobRunId) ?? "RUNNING";
  }
}

class FakeAthenaGateway implements AthenaGateway {
  startedQueries: AthenaQueryInput[] = [];
  defaultStatus: AthenaQueryStatus | null = null;
  private statuses = new Map<string, AthenaQueryStatus>();

  async startQuery(input: AthenaQueryInput): Promise<string> {
    this.startedQueries.push(input);
    const queryExecutionId = `query-${this.startedQueries.length}`;
    if (this.defaultStatus !== null) {
      this.statuses.set(queryExecutionId, this.defaultStatus);
    }
    return queryExecutionId;
  }

  setStatus(queryExecutionId: string, status: AthenaQueryStatus): void {
    this.statuses.set(queryExecutionId, status);
  }

  async getStatus(queryExecutionId: string): Promise<AthenaQueryStatus> {
    return this.statuses.get(queryExecutionId) ?? this.defaultStatus ?? "RUNNING";
  }

  async getResults(queryExecutionId: string): Promise<readonly AthenaMetricRow[]> {
    void queryExecutionId;
    return [
      {
        metricType: "user_growth",
        societyId: null,
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-01T23:59:59.999Z"),
        data: {
          registrations: 12,
          activeUsers: 40,
          totalUsers: 300,
          suspensions: 0,
        },
      },
      {
        metricType: "moderation",
        societyId: "society-1",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-01T23:59:59.999Z"),
        data: {
          pendingReports: 3,
          resolvedToday: 1,
          avgResolutionHours: 5,
          totalReports: 8,
        },
      },
    ];
  }
}

const SQL_CATALOG = {
  user_growth: "SELECT * FROM metric_user_growth",
  content_volume: "SELECT * FROM metric_content_volume",
  top_societies: "SELECT * FROM metric_top_societies",
  moderation: "SELECT * FROM metric_moderation",
};

describe("AnalyticsRefreshOrchestrator", () => {
  let repository: FakeAnalyticsRepository;
  let runStore: InMemoryRefreshRunStore;
  let glue: FakeGlueGateway;
  let athena: FakeAthenaGateway;

  beforeEach(() => {
    repository = new FakeAnalyticsRepository();
    runStore = new InMemoryRefreshRunStore();
    glue = new FakeGlueGateway();
    athena = new FakeAthenaGateway();
    athena.defaultStatus = "SUCCEEDED";
  });

  function createOrchestrator(overrides?: {
    maxPhaseRetries?: number;
    glue?: GlueGateway;
    athena?: AthenaGateway;
  }): AnalyticsRefreshOrchestrator {
    return new AnalyticsRefreshOrchestrator({
      repository,
      runStore,
      glueGateway: overrides?.glue ?? glue,
      athenaGateway: overrides?.athena ?? athena,
      sqlByMetricType: SQL_CATALOG,
      maxPhaseRetries: overrides?.maxPhaseRetries,
    });
  }

  it("creates a run and starts the Glue export", async () => {
    const result = await createOrchestrator().requestRefresh("admin");

    expect(result.coalesced).toBe(false);
    expect(glue.startCalls).toBe(1);

    const runs = await allStoredRuns(runStore);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      trigger: "admin",
      status: "exporting",
      glueJobRunId: `jobrun-${runs[0]!.runId}`,
    });
  });

  it("coalesces a second request onto an active run instead of starting another export", async () => {
    const first = await createOrchestrator().requestRefresh("nightly");
    const second = await createOrchestrator().requestRefresh("admin");

    expect(second.coalesced).toBe(true);
    expect(second.runId).toBe(first.runId);
    expect(glue.startCalls).toBe(1);
  });

  it("advances glue success into athena queries and persists their results", async () => {
    const orchestrator = createOrchestrator();

    // Force the initial export start to fail once to also cover the
    // reconciler's retry path.
    glue.failStarts = true;
    const result = await orchestrator.requestRefresh("admin");
    expect(result.coalesced).toBe(false);
    expect((await soleRun(runStore)).status).toBe("requested");
    glue.failStarts = false;

    await orchestrator.reconcile();
    let stored = await soleRun(runStore);
    expect(stored.status).toBe("exporting");
    expect(stored.attempts).toBe(1);

    // Glue still RUNNING → nothing changes.
    await orchestrator.reconcile();
    stored = await soleRun(runStore);
    expect(stored.status).toBe("exporting");

    // Glue finishes → both metric-group queries start with stable tokens.
    glue.statuses.set(stored.glueJobRunId!, "SUCCEEDED");
    await orchestrator.reconcile();
    expect(athena.startedQueries.map((q) => q.clientRequestToken)).toEqual([
      `${stored.runId}:user_growth`,
      `${stored.runId}:content_volume`,
      `${stored.runId}:top_societies`,
      `${stored.runId}:moderation`,
    ]);

    stored = await soleRun(runStore);
    expect(stored.status).toBe("completed");
    expect(repository.upserts).toHaveLength(8);
    const growthRow = repository.upserts.find(
      (row) => row.metricType === "user_growth",
    )!;
    expect(growthRow.societyId).toBeNull();
    expect(growthRow.data).toMatchObject({ registrations: 12 });
    const moderationRow = repository.upserts.find(
      (row) => row.metricType === "moderation",
    )!;
    expect(moderationRow.societyId).toBe("society-1");
  });

  it("does not restart already-started athena queries when resuming", async () => {
    const orchestrator = createOrchestrator();
    const { runId } = await orchestrator.requestRefresh("nightly");
    glue.statuses.set(await glueJobRunIdFor(runStore, runId), "SUCCEEDED");
    await orchestrator.reconcile();

    const startedBefore = athena.startedQueries.length;

    const resumed = createOrchestrator();
    await resumed.reconcile();

    expect(athena.startedQueries).toHaveLength(startedBefore);
  });

  it("fails a run after the glue-start retry cap", async () => {
    const failing = new FakeGlueGateway();
    failing.failStarts = true;
    const orchestrator = createOrchestrator({ glue: failing, maxPhaseRetries: 2 });

    await orchestrator.requestRefresh("admin");

    await orchestrator.reconcile();
    await orchestrator.reconcile();
    // A further tick on a terminal run must not resurrect it.
    await orchestrator.reconcile();

    const stored = await soleRun(runStore);
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toContain("retry limit");
    expect(failing.startCalls).toBe(2);
  });

  it("retries failed athena groups while preserving completed groups", async () => {
    const orchestrator = createOrchestrator({ maxPhaseRetries: 2 });
    const { runId } = await orchestrator.requestRefresh("admin");
    athena.defaultStatus = "RUNNING";
    glue.statuses.set(await glueJobRunIdFor(runStore, runId), "SUCCEEDED");
    await orchestrator.reconcile();

    let stored = await soleRun(runStore);
    expect(stored.status).toBe("querying");
    const [growthQuery, contentQuery, topSocietiesQuery, moderationQuery] = Object.values(
      stored.athenaQueryExecutionIds,
    );
    expect(growthQuery).toBeDefined();
    expect(contentQuery).toBeDefined();
    expect(topSocietiesQuery).toBeDefined();
    expect(moderationQuery).toBeDefined();

    athena.setStatus(growthQuery!, "SUCCEEDED");
    athena.setStatus(contentQuery!, "SUCCEEDED");
    athena.setStatus(topSocietiesQuery!, "SUCCEEDED");
    athena.setStatus(moderationQuery!, "FAILED");

    await orchestrator.reconcile();
    stored = await soleRun(runStore);
    expect(stored.attempts).toBe(1);
    expect(Object.keys(stored.athenaQueryExecutionIds)).toEqual([
      "user_growth",
      "content_volume",
      "top_societies",
    ]);

    athena.defaultStatus = "SUCCEEDED";
    await orchestrator.reconcile();
    stored = await soleRun(runStore);
    expect(stored.status).toBe("completed");
    expect(Object.keys(stored.athenaQueryExecutionIds)).toEqual([
      "user_growth",
      "content_volume",
      "top_societies",
      "moderation",
    ]);
    expect(repository.upserts.length).toBeGreaterThan(0);
  });

  it("marks stale unfinished runs as failed during reconcile", async () => {
    let nowMs = new Date("2026-09-02T02:00:00.000Z").getTime();
    const mutableClock: Clock = { now: () => new Date(nowMs) };
    const orchestrator = new AnalyticsRefreshOrchestrator({
      repository,
      runStore,
      glueGateway: glue,
      athenaGateway: athena,
      sqlByMetricType: SQL_CATALOG,
      clock: mutableClock,
      staleAfterMs: 60_000,
    });

    await runStore.save({
      runId: "stale-run",
      trigger: "nightly",
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
      status: "exporting",
      attempts: 0,
      lastError: null,
      glueJobRunId: "jobrun-stale",
      athenaQueryExecutionIds: {},
    });

    nowMs += 120_000;
    await orchestrator.reconcile();

    const stored = (await allStoredRuns(runStore)).find(
      (run) => run.runId === "stale-run",
    )!;
    expect(stored.status).toBe("failed");
  });
});

async function allStoredRuns(store: RefreshRunStore): Promise<RefreshRunRecord[]> {
  const accessor = store as unknown as {
    runs: Map<string, RefreshRunRecord>;
  };
  return [...accessor.runs.values()];
}

async function soleRun(store: InMemoryRefreshRunStore): Promise<RefreshRunRecord> {
  const runs = await allStoredRuns(store);
  expect(runs).toHaveLength(1);
  return runs[0]!;
}

async function glueJobRunIdFor(
  store: InMemoryRefreshRunStore,
  runId: string,
): Promise<string> {
  const run = await store.get(runId);
  expect(run).not.toBeNull();
  expect(run!.glueJobRunId).not.toBeNull();
  return run!.glueJobRunId!;
}
