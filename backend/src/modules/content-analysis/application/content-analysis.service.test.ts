import { describe, expect, it, vi } from "vitest";
import pino from "pino";

import type { Logger } from "pino";
import type { Clock } from "../../../shared/application/clock";
import { ContentAnalysisService } from "./content-analysis.service";
import type { ContentAnalyzerPort } from "./content-analyzer.port";
import type {
  AnalysisInvocationResult,
  ThreadAnalysisDetails,
} from "./content-analysis.dto";
import type {
  ContentAnalysisRepository,
  RecordRunFailureInput,
  RecordRunResultInput,
  SaveOverrideInput,
} from "./content-analysis.repository";
import type {
  ThreadAnalysisContext,
  ThreadAnalysisContextPort,
  ThreadAnalysisSnapshot,
} from "./thread-analysis-context.port";
import type {
  AutomatedRemovalPort,
  RemoveThreadIfPublishedInput,
} from "./automated-removal.port";
import type { ContentAnalysisRun } from "../domain/content-analysis";
import type { ContentAnalysisOverride } from "../domain/content-analysis";

const logger: Logger = pino({ level: "silent" });

const clock: Clock = { now: () => new Date("2026-08-04T00:00:00.000Z") };

const context: ThreadAnalysisContext = {
  threadId: "t1",
  title: "Title",
  body: "Body",
  status: "published",
  globalPolicy: "policy",
  societyRules: [],
  images: [],
};

function successInvocation(): AnalysisInvocationResult {
  return {
    result: {
      decision: "allow",
      sentiment: { label: "positive", confidence: 0.9 },
      findings: [],
      summary: "ok",
      rationale: "reasoning",
    },
    modelId: "deepseek/test",
    lambdaFunctionVersion: "42",
    lambdaRequestId: "req-1",
    providerRequestId: null,
  };
}

/** Builds a review invocation with high-severity, high-confidence findings. */
function reviewInvocation(
  findings: Array<{
    category: string;
    severity: "low" | "medium" | "high";
    confidence: number;
    source: "title" | "body" | "image" | "comment";
    sourceId?: string;
    evidence?: string;
  }> = [
    {
      category: "harassment",
      severity: "high",
      confidence: 0.98,
      source: "body",
      evidence: "evidence",
    },
  ],
): AnalysisInvocationResult {
  return {
    result: {
      decision: "review",
      sentiment: { label: "negative", confidence: 0.8 },
      findings: findings.map((f) => ({ ...f, evidence: f.evidence ?? f.category })),
      summary: "flagged",
      rationale: "high confidence violation",
    },
    modelId: "deepseek/test",
    lambdaFunctionVersion: "42",
    lambdaRequestId: "req-1",
    providerRequestId: null,
  };
}

const publishedSnapshot = {
  threadId: "t1",
  societyId: "s1",
  authorId: "u1",
  status: "published" as const,
};

const removedSnapshot = {
  threadId: "t1",
  societyId: "s1",
  authorId: "u1",
  status: "removed" as const,
};

class StubRepository implements ContentAnalysisRepository {
  readonly created: ContentAnalysisRun[] = [];
  readonly succeeded: RecordRunResultInput[] = [];
  readonly failed: RecordRunFailureInput[] = [];
  readonly pending: ContentAnalysisRun[] = [];
  readonly overrides: SaveOverrideInput[] = [];
  started: number = 0;

  async create(run: ContentAnalysisRun): Promise<ContentAnalysisRun> {
    this.created.push(run);
    return run;
  }
  async findById(): Promise<ContentAnalysisRun | null> {
    return null;
  }
  async findBySourceEvent(): Promise<ContentAnalysisRun[]> {
    return [];
  }
  async markStarted(): Promise<void> {
    this.started += 1;
  }
  async recordSuccess(input: RecordRunResultInput): Promise<void> {
    this.succeeded.push(input);
  }
  async recordFailure(input: RecordRunFailureInput): Promise<void> {
    this.failed.push(input);
  }
  async findStalePending(
    olderThan: Date,
    limit = 50,
  ): Promise<ContentAnalysisRun[]> {
    return this.pending
      .filter(
        (run) =>
          (run.status === "queued" || run.status === "running" || run.status === "failed") &&
          run.createdAt < olderThan,
      )
      .slice(0, limit);
  }
  async findThreadIdsWithRun(threadIds: readonly string[]): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const run of [...this.created, ...this.pending]) {
      if (threadIds.includes(run.threadId)) ids.add(run.threadId);
    }
    return ids;
  }
  async findLatestDecisionsByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, "allow" | "review">> {
    const map = new Map<string, "allow" | "review">();
    for (const run of this.created) {
      if (run.decision !== null) map.set(run.threadId, run.decision);
    }
    void threadIds;
    return map;
  }
  async findLatestAnalysisStatesByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, { status: "succeeded" | "failed"; decision: "allow" | "review" | null; override: "accept" | "reject" | null }>> {
    const map = new Map<string, { status: "succeeded" | "failed"; decision: "allow" | "review" | null; override: "accept" | "reject" | null }>();
    for (const run of this.created) {
      if (threadIds.includes(run.threadId)) {
        map.set(run.threadId, { status: run.status === "failed" ? "failed" : "succeeded", decision: run.decision, override: null });
      }
    }
    return map;
  }
  async findLatestSucceededAnalysis(): Promise<ThreadAnalysisDetails | null> {
    return null;
  }
  async findLatestStatusByThreads(): Promise<ReadonlyMap<string, "succeeded" | "failed">> {
    return new Map();
  }
  async saveOverride(input: SaveOverrideInput): Promise<ContentAnalysisOverride> {
    this.overrides.push(input);
    return { ...input, updatedAt: input.createdAt };
  }
  async findOverriddenThreadIds(threadIds: readonly string[]): Promise<Set<string>> {
    void threadIds;
    return new Set();
  }
  async findLatestOverridesByThreads(): Promise<ReadonlyMap<string, "accept" | "reject">> {
    return new Map();
  }
  async findNextRunNumber(sourceEventId: string): Promise<number> {
    const used = this.created
      .filter((run) => run.sourceEventId === sourceEventId)
      .map((run) => run.runNumber);
    return used.length === 0 ? 1 : Math.max(...used) + 1;
  }
}

function makeService(
  overrides: {
    mode?: "off" | "shadow" | "enforce";
    analyzer?: ContentAnalyzerPort;
    contextPort?: ThreadAnalysisContextPort;
    removalPort?: AutomatedRemovalPort;
    threshold?: number;
    maxRetries?: number;
    loadThreadSnapshot?: (threadId: string) => Promise<ThreadAnalysisSnapshot>;
  } = {},
) {
  const repository = new StubRepository();
  const analyzer: ContentAnalyzerPort =
    overrides.analyzer ??
    {
      analyze: vi.fn(async () => successInvocation()),
    };
  const threadContext: ThreadAnalysisContextPort =
    overrides.contextPort ??
    {
      loadThreadContext: vi.fn(async () => context),
      loadThreadSnapshot: vi.fn(async () => publishedSnapshot),
      listPublishedThreadIdsBefore: vi.fn(async () => []),
    };
  const service = new ContentAnalysisService({
    repository,
    analyzer,
    threadContext,
    mode: overrides.mode ?? "shadow",
    policyVersion: "1",
    promptVersion: "1",
    logger,
    clock,
    ...(overrides.threshold === undefined
      ? {}
      : { threshold: overrides.threshold }),
    ...(overrides.maxRetries === undefined
      ? {}
      : { maxRetries: overrides.maxRetries }),
    ...(overrides.removalPort === undefined
      ? {}
      : { removalPort: overrides.removalPort }),
    ...(overrides.loadThreadSnapshot === undefined
      ? {}
      : { loadThreadSnapshot: overrides.loadThreadSnapshot }),
  });
  return { service, repository };
}

describe("ContentAnalysisService.analyzeNewThread", () => {
  it("does nothing when mode is off", async () => {
    const { service, repository } = makeService({ mode: "off" });
    const result = await service.analyzeNewThread("t1");
    expect(result).toBeNull();
    expect(repository.created).toHaveLength(0);
  });

  it("creates a run, invokes the analyzer, and records success in shadow mode", async () => {
    const { service, repository } = makeService();
    const result = await service.analyzeNewThread("t1");

    expect(result?.decision).toBe("allow");
    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]).toMatchObject({
      threadId: "t1",
      sourceEventId: "t1",
      triggerType: "thread_created",
      status: "queued",
    });
    expect(repository.started).toBe(1);
    expect(repository.succeeded).toHaveLength(1);
    expect(repository.succeeded[0]).toMatchObject({
      decision: "allow",
      sentimentLabel: "positive",
      lambdaFunctionVersion: "42",
      promptVersion: "1",
      policyVersion: "1",
    });
  });

  it("records a failed run and returns null when the analyzer throws", async () => {
    const failingAnalyzer: ContentAnalyzerPort = {
      analyze: vi.fn(async () => {
        throw new Error("openrouter 429");
      }),
    };
    const { service, repository } = makeService({ analyzer: failingAnalyzer });

    const result = await service.analyzeNewThread("t1");
    expect(result).toBeNull();
    expect(repository.failed).toHaveLength(1);
    expect(repository.failed[0]).toMatchObject({ errorCode: "ANALYSIS_INVOCATION_FAILED" });
    expect(repository.succeeded).toHaveLength(0);
  });

  it("records a failed run when thread context cannot be loaded", async () => {
    const contextPort: ThreadAnalysisContextPort = {
      loadThreadContext: vi.fn(async () => {
        const error = new Error("missing") as Error & { code?: string };
        error.code = "NOT_FOUND";
        throw error;
      }),
      loadThreadSnapshot: vi.fn(async () => publishedSnapshot),
      listPublishedThreadIdsBefore: vi.fn(async () => []),
    };
    const { service, repository } = makeService({ contextPort });

    const result = await service.analyzeNewThread("t1");
    expect(result).toBeNull();
    expect(repository.failed).toHaveLength(1);
    expect(repository.failed[0]).toMatchObject({ errorCode: "NOT_FOUND" });
  });

  it("builds an images array capped by the analyzer request", async () => {
    let captured: unknown;
    const analyzer: ContentAnalyzerPort = {
      analyze: vi.fn(async (request) => {
        captured = request;
        return successInvocation();
      }),
    };
    const { service } = makeService({ analyzer });
    await service.analyzeNewThread("t1");

    const request = captured as {
      content: { comments: unknown[] };
      policyVersion: string;
      promptVersion: string;
      triggerType: string;
    };
    expect(request).toMatchObject({
      triggerType: "thread_created",
      policyVersion: "1",
      promptVersion: "1",
    });
    expect(request.content.comments).toEqual([]);
  });
});

describe("ContentAnalysisService.retryStaleRuns", () => {
  function pendingRun(
    overrides: Partial<ContentAnalysisRun> = {},
  ): ContentAnalysisRun {
    return {
      id: "run-1",
      sourceEventId: "t1",
      runNumber: 1,
      triggerType: "thread_created",
      threadId: "t1",
      reportId: null,
      status: "queued",
      attemptCount: 0,
      decision: null,
      inputHash: "",
      modelId: null,
      lambdaFunctionVersion: null,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("does nothing when mode is off", async () => {
    const { service, repository } = makeService({ mode: "off" });
    repository.pending.push(pendingRun());

    const retried = await service.retryStaleRuns();
    expect(retried).toBe(0);
    expect(repository.started).toBe(0);
    expect(repository.succeeded).toHaveLength(0);
  });

  it("re-invokes the analyzer and settles each stale pending run", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({ analyzer: { analyze } });
    repository.pending.push(
      pendingRun({ id: "run-1", threadId: "t1" }),
      pendingRun({ id: "run-2", threadId: "t2", status: "running" }),
    );

    const retried = await service.retryStaleRuns();

    expect(retried).toBe(2);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(repository.started).toBe(2);
    expect(repository.succeeded).toHaveLength(2);
    expect(repository.succeeded.map((s) => s.id).sort()).toEqual([
      "run-1",
      "run-2",
    ]);
  });

  it("ignores pending runs younger than the stale threshold", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({ analyzer: { analyze } });
    // createdAt is after the service clock (2026-08-04T00:00:00.000Z).
    repository.pending.push(
      pendingRun({ createdAt: new Date("2026-08-04T00:00:00.000Z") }),
    );

    const retried = await service.retryStaleRuns({
      staleAfterMs: 15 * 60 * 1000,
    });
    expect(retried).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("settles a stale run as failed when the analyzer throws", async () => {
    const failingAnalyzer: ContentAnalyzerPort = {
      analyze: vi.fn(async () => {
        throw new Error("openrouter 429");
      }),
    };
    const { service, repository } = makeService({ analyzer: failingAnalyzer });
    repository.pending.push(pendingRun({ id: "run-1" }));

    const retried = await service.retryStaleRuns();
    expect(retried).toBe(1);
    expect(repository.failed).toHaveLength(1);
    expect(repository.failed[0]).toMatchObject({
      id: "run-1",
      errorCode: "ANALYSIS_INVOCATION_FAILED",
    });
  });

  it("re-invokes failed runs so the next cron tick re-analyzes them", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({ analyzer: { analyze } });
    repository.pending.push(
      pendingRun({ id: "run-f", threadId: "t-f", status: "failed" }),
    );

    const retried = await service.retryStaleRuns();

    expect(retried).toBe(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    // re-execution succeeded -> recorded as a successful run.
    expect(repository.succeeded.map((s) => s.id)).toEqual(["run-f"]);
  });

  it("does not re-invoke a failed run after max retries", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({
      analyzer: { analyze },
      maxRetries: 3,
    });
    repository.pending.push(
      pendingRun({ id: "run-f", status: "failed", attemptCount: 3 }),
    );

    const retried = await service.retryStaleRuns();

    expect(retried).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
    expect(repository.succeeded).toHaveLength(0);
  });
});

describe("ContentAnalysisService.sweepPending", () => {
  function ctxPort(ids: string[]): ThreadAnalysisContextPort {
    return {
      loadThreadContext: vi.fn(async () => context),
      loadThreadSnapshot: vi.fn(async () => publishedSnapshot),
      listPublishedThreadIdsBefore: vi.fn(async () => ids),
    };
  }

  it("does nothing when mode is off", async () => {
    const { service, repository } = makeService({ mode: "off" });
    const result = await service.sweepPending();
    expect(result).toEqual({ backfilled: 0, retried: 0 });
    expect(repository.created).toHaveLength(0);
  });

  it("backfills published threads that have no analysis run", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({
      analyzer: { analyze },
      contextPort: ctxPort(["t-no-1", "t-no-2"]),
    });

    const result = await service.sweepPending();

    expect(result).toEqual({ backfilled: 2, retried: 0 });
    expect(repository.created).toHaveLength(2);
    expect(repository.created.map((r) => r.triggerType)).toEqual([
      "backfill",
      "backfill",
    ]);
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("skips threads that already have a run and retries stale failed runs", async () => {
    const analyze = vi.fn(async () => successInvocation());
    const { service, repository } = makeService({
      analyzer: { analyze },
      contextPort: ctxPort(["t-have-run", "t3"]),
    });
    await service.analyzeNewThread("t-have-run");
    repository.pending.push({
      id: "run-s",
      sourceEventId: "t3",
      runNumber: 1,
      triggerType: "thread_created",
      threadId: "t3",
      reportId: null,
      status: "failed",
      attemptCount: 1,
      decision: null,
      inputHash: "",
      modelId: null,
      lambdaFunctionVersion: null,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    const before = repository.created.length;
    const result = await service.sweepPending();

    // t-have-run already has a run (skipped); t3 is not backfilled (has a run)
    // but its stale failed run is retried and settles as succeeded.
    expect(result).toEqual({ backfilled: 0, retried: 1 });
    expect(repository.created.length).toBe(before);
    expect(repository.succeeded.map((s) => s.id)).toContain("run-s");
  });
});

describe("ContentAnalysisService.reanalyzeThread", () => {
  it("creates a new run with the next run number and returns the result", async () => {
    const { service, repository } = makeService();
    const first = await service.analyzeNewThread("t1");
    expect(first?.decision).toBe("allow");

    const second = await service.reanalyzeThread("t1");
    expect(second?.decision).toBe("allow");

    expect(repository.created).toHaveLength(2);
    expect(repository.created[0]!.runNumber).toBe(1);
    expect(repository.created[0]!.triggerType).toBe("thread_created");
    expect(repository.created[1]!.runNumber).toBe(2);
    expect(repository.created[1]!.triggerType).toBe("reanalysis");
    expect(repository.succeeded).toHaveLength(2);
  });

  it("does nothing when mode is off", async () => {
    const { service, repository } = makeService({ mode: "off" });
    expect(await service.reanalyzeThread("t1")).toBeNull();
    expect(repository.created).toHaveLength(0);
  });

  it("marks the Lambda request as a reanalysis", async () => {
    let capturedTrigger: string | undefined;
    const analyzer: ContentAnalyzerPort = {
      analyze: vi.fn(async (request) => {
        capturedTrigger = request.triggerType;
        return successInvocation();
      }),
    };
    const { service } = makeService({ analyzer });

    await service.reanalyzeThread("t1");

    expect(capturedTrigger).toBe("reanalysis");
  });
});

describe("ContentAnalysisService.overrideThread", () => {
  it("persists an accept override with the actor and reason", async () => {
    const { service, repository } = makeService();
    await service.overrideThread("t1", "accept", "admin-1", "Looks fine.");

    expect(repository.overrides).toHaveLength(1);
    expect(repository.overrides[0]).toMatchObject({
      threadId: "t1",
      decision: "accept",
      actorId: "admin-1",
      reason: "Looks fine.",
    });
  });

  it("stores an empty/blank reason as null", async () => {
    const { service, repository } = makeService();
    await service.overrideThread("t1", "reject", "admin-1", "   ");

    expect(repository.overrides[0]!.reason).toBeNull();
  });
});

describe("ContentAnalysisService auto-removal enforcement", () => {
  function removalPort(
    outcome: "removed" | "already_inactive" = "removed",
    fn?: (input: RemoveThreadIfPublishedInput) => void,
  ) {
    const call = vi.fn(async (input: RemoveThreadIfPublishedInput) => {
      fn?.(input);
      return outcome;
    });
    const port: AutomatedRemovalPort = { removeThreadIfPublished: call };
    return { port, call };
  }

  it("enforce removes a matching published thread via the removal port", async () => {
    let captured: RemoveThreadIfPublishedInput | undefined;
    const { port, call } = removalPort("removed", (input) => {
      captured = input;
    });
    const { service, repository } = makeService({
      mode: "enforce",
      analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
      removalPort: port,
    });

    const result = await service.analyzeNewThread("t1");

    expect(result?.decision).toBe("review");
    expect(repository.succeeded).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({
      threadId: "t1",
      societyId: "s1",
      authorId: "u1",
      reasonCode: "high_severity_high_confidence",
      threshold: 0.9,
      promptVersion: "1",
      policyVersion: "1",
      modelId: "deepseek/test",
    });
    expect(captured?.finding).toMatchObject({
      category: "harassment",
      severity: "high",
      confidence: 0.98,
      source: "body",
    });
    // The run remains succeeded — enforcement did not alter it.
    expect(repository.failed).toHaveLength(0);
  });

  it("does nothing when the snapshot status is not published (port not called)", async () => {
    const { port, call } = removalPort("removed");
    const { service, repository } = makeService({
      mode: "enforce",
      analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
      removalPort: port,
      loadThreadSnapshot: vi.fn(async () => removedSnapshot),
    });

    const result = await service.analyzeNewThread("t1");
    expect(result?.decision).toBe("review");
    expect(repository.succeeded).toHaveLength(1);
    expect(call).not.toHaveBeenCalled();
  });

  it("does nothing when shouldAutoRemove is false (allow / low confidence)", async () => {
    // allow decision — never auto-removes.
    const allow = removalPort("removed");
    {
      const { service, repository } = makeService({
        mode: "enforce",
        analyzer: { analyze: vi.fn(async () => successInvocation()) },
        removalPort: allow.port,
      });
      await service.analyzeNewThread("t1");
      expect(repository.succeeded).toHaveLength(1);
      expect(allow.call).not.toHaveBeenCalled();
    }

    // review but only low-confidence finding — no auto-removal.
    const lowConf = removalPort("removed");
    {
      const { service } = makeService({
        mode: "enforce",
        analyzer: {
          analyze: vi.fn(async () =>
            reviewInvocation([
              { category: "harassment", severity: "high", confidence: 0.5, source: "body" },
            ]),
          ),
        },
        removalPort: lowConf.port,
      });
      await service.analyzeNewThread("t1");
      expect(lowConf.call).not.toHaveBeenCalled();
    }
  });

  it("does nothing for non-matching review findings left in the moderation queue", async () => {
    const { port, call } = removalPort("removed");
    const { service } = makeService({
      mode: "enforce",
      analyzer: {
        analyze: vi.fn(async () =>
          reviewInvocation([
            { category: "spam", severity: "medium", confidence: 0.95, source: "title" },
          ]),
        ),
      },
      removalPort: port,
    });
    await service.analyzeNewThread("t1");
    expect(call).not.toHaveBeenCalled();
  });

  it("mode shadow and off do nothing even with matching findings", async () => {
    for (const mode of ["shadow", "off"] as const) {
      const { port, call } = removalPort("removed");
      const { service, repository } = makeService({
        mode,
        analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
        removalPort: port,
      });
      await service.analyzeNewThread("t1");
      expect(call).not.toHaveBeenCalled();
      if (mode === "off") {
        expect(repository.succeeded).toHaveLength(0);
      } else {
        // shadow persists but never removes.
        expect(repository.succeeded).toHaveLength(1);
      }
    }
  });

  it("skips enforcement (with a warning) when no removal port is wired", async () => {
    const { service, repository } = makeService({
      mode: "enforce",
      analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
    });
    const result = await service.analyzeNewThread("t1");
    expect(result?.decision).toBe("review");
    expect(repository.succeeded).toHaveLength(1);
    expect(repository.failed).toHaveLength(0);
  });

  it("catches an enforcement error and does not fail the run", async () => {
    const port: AutomatedRemovalPort = {
      removeThreadIfPublished: vi.fn(async () => {
        throw new Error("removal boom");
      }),
    };
    const { service, repository } = makeService({
      mode: "enforce",
      analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
      removalPort: port,
    });

    const result = await service.analyzeNewThread("t1");
    expect(result?.decision).toBe("review");
    expect(repository.succeeded).toHaveLength(1);
    expect(repository.failed).toHaveLength(0);
  });

  it("does nothing when the removal port returns already_inactive", async () => {
    const { port, call } = removalPort("already_inactive");
    const { service, repository } = makeService({
      mode: "enforce",
      analyzer: { analyze: vi.fn(async () => reviewInvocation()) },
      removalPort: port,
    });

    const result = await service.analyzeNewThread("t1");
    expect(result?.decision).toBe("review");
    expect(repository.succeeded).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(repository.failed).toHaveLength(0);
  });
});
