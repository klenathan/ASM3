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
} from "./thread-analysis-context.port";
import type { ContentAnalysisRun } from "../domain/content-analysis";
import type { ContentAnalysisOverride } from "../domain/content-analysis";

const logger: Logger = pino({ level: "silent" });

const clock: Clock = { now: () => new Date("2026-08-04T00:00:00.000Z") };

const context: ThreadAnalysisContext = {
  threadId: "t1",
  title: "Title",
  body: "Body",
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
          (run.status === "queued" || run.status === "running") &&
          run.createdAt < olderThan,
      )
      .slice(0, limit);
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
  async findLatestSucceededAnalysis(): Promise<ThreadAnalysisDetails | null> {
    return null;
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
    { loadThreadContext: vi.fn(async () => context) };
  const service = new ContentAnalysisService({
    repository,
    analyzer,
    threadContext,
    mode: overrides.mode ?? "shadow",
    policyVersion: "1",
    promptVersion: "1",
    logger,
    clock,
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
