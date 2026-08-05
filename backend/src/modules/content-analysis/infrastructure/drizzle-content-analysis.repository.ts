import { and, asc, desc, eq, inArray, isNotNull, lt, max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ContentAnalysisRepository,
  RecordRunFailureInput,
  RecordRunResultInput,
  SaveOverrideInput,
} from "../application/content-analysis.repository";
import type {
  ContentAnalysisFinding,
  SentimentLabel,
  ThreadAnalysisDetails,
} from "../application/content-analysis.dto";
import type {
  AnalysisOverrideDecision,
  ContentAnalysisOverride,
  ContentAnalysisRun,
} from "../domain/content-analysis";
import {
  contentAnalysisOverrides,
  contentAnalysisRuns,
} from "./content-analysis.tables";

/**
 * Drizzle implementation of ContentAnalysisRepository. Never imported outside
 * the module's infrastructure layer.
 */
export class DrizzleContentAnalysisRepository implements ContentAnalysisRepository {
  readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async create(run: ContentAnalysisRun): Promise<ContentAnalysisRun> {
    await this.db
      .insert(contentAnalysisRuns)
      .values({
        id: run.id,
        sourceEventId: run.sourceEventId,
        runNumber: run.runNumber,
        triggerType: run.triggerType,
        threadId: run.threadId,
        reportId: run.reportId,
        status: run.status,
        decision: run.decision,
        inputHash: run.inputHash,
        modelId: run.modelId,
        lambdaFunctionVersion: run.lambdaFunctionVersion,
        createdAt: run.createdAt,
      });
    return run;
  }

  async findById(id: string): Promise<ContentAnalysisRun | null> {
    const [row] = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(eq(contentAnalysisRuns.id, id));
    return row === undefined ? null : toRun(row);
  }

  async findBySourceEvent(sourceEventId: string): Promise<ContentAnalysisRun[]> {
    const rows = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(eq(contentAnalysisRuns.sourceEventId, sourceEventId));
    return rows.map(toRun);
  }

  async markStarted(id: string, startedAt: Date): Promise<void> {
    await this.db
      .update(contentAnalysisRuns)
      .set({ status: "running", startedAt, attemptCount: 1 })
      .where(eq(contentAnalysisRuns.id, id));
  }

  async findStalePending(
    olderThan: Date,
    limit = 50,
  ): Promise<ContentAnalysisRun[]> {
    const rows = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(
        and(
          inArray(contentAnalysisRuns.status, ["queued", "running", "failed"]),
          lt(contentAnalysisRuns.createdAt, olderThan),
        ),
      )
      .orderBy(asc(contentAnalysisRuns.createdAt))
      .limit(limit);
    return rows.map(toRun);
  }

  async findThreadIdsWithRun(threadIds: readonly string[]): Promise<Set<string>> {
    if (threadIds.length === 0) return new Set();
    const rows = await this.db
      .select({ threadId: contentAnalysisRuns.threadId })
      .from(contentAnalysisRuns)
      .where(inArray(contentAnalysisRuns.threadId, [...threadIds]));
    return new Set(rows.map((row) => row.threadId));
  }

  async recordSuccess(input: RecordRunResultInput): Promise<void> {
    await this.db
      .update(contentAnalysisRuns)
      .set({
        status: "succeeded",
        decision: input.decision,
        sentimentLabel: input.sentimentLabel,
        confidence: input.confidence,
        findings: input.findings,
        summary: input.summary,
        rationale: input.rationale,
        providerRequestId: input.providerRequestId,
        modelId: input.modelId,
        lambdaFunctionVersion: input.lambdaFunctionVersion,
        lambdaRequestId: input.lambdaRequestId,
        promptVersion: input.promptVersion,
        policyVersion: input.policyVersion,
        errorCode: null,
        completedAt: input.completedAt,
      })
      .where(eq(contentAnalysisRuns.id, input.id));
  }

  async recordFailure(input: RecordRunFailureInput): Promise<void> {
    await this.db
      .update(contentAnalysisRuns)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        completedAt: input.completedAt,
      })
      .where(eq(contentAnalysisRuns.id, input.id));
  }

  async findLatestDecisionsByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, "allow" | "review">> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn(
        [contentAnalysisRuns.threadId],
        {
          threadId: contentAnalysisRuns.threadId,
          decision: contentAnalysisRuns.decision,
          createdAt: contentAnalysisRuns.createdAt,
        },
      )
      .from(contentAnalysisRuns)
      .where(
        and(
          inArray(contentAnalysisRuns.threadId, [...threadIds]),
          isNotNull(contentAnalysisRuns.decision),
        ),
      )
      .orderBy(
        contentAnalysisRuns.threadId,
        desc(contentAnalysisRuns.createdAt),
      );

    const decisions = new Map<string, "allow" | "review">();
    for (const row of rows) {
      if (row.decision !== null) {
        decisions.set(row.threadId, row.decision as "allow" | "review");
      }
    }
    return decisions;
  }

  async findLatestAnalysisStatesByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, {
    readonly status: "queued" | "running" | "succeeded" | "failed";
    readonly decision: "allow" | "review" | null;
    readonly override: "accept" | "reject" | null;
  }>> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn(
        [contentAnalysisRuns.threadId],
        {
          threadId: contentAnalysisRuns.threadId,
          status: contentAnalysisRuns.status,
          decision: contentAnalysisRuns.decision,
        },
      )
      .from(contentAnalysisRuns)
      .where(
        and(
          inArray(contentAnalysisRuns.threadId, [...threadIds]),
        ),
      )
      .orderBy(contentAnalysisRuns.threadId, desc(contentAnalysisRuns.createdAt));
    const overrides = await this.findLatestOverridesByThreads(threadIds);
    return new Map<string, {
      readonly status: "queued" | "running" | "succeeded" | "failed";
      readonly decision: "allow" | "review" | null;
      readonly override: "accept" | "reject" | null;
    }>(rows.map((row) => [row.threadId, {
      status: row.status as "queued" | "running" | "succeeded" | "failed",
      decision: row.status === "succeeded"
        ? row.decision as "allow" | "review" | null
        : null,
      override: overrides.get(row.threadId) ?? null,
    }]));
  }

  async findLatestSucceededAnalysis(
    threadId: string,
  ): Promise<ThreadAnalysisDetails | null> {
    const [row] = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(
        and(
          eq(contentAnalysisRuns.threadId, threadId),
          inArray(contentAnalysisRuns.status, ["succeeded", "failed"]),
        ),
      )
      .orderBy(desc(contentAnalysisRuns.createdAt))
      .limit(1);
    if (row === undefined) return null;
    const [overrideRow] = await this.db
      .select()
      .from(contentAnalysisOverrides)
      .where(eq(contentAnalysisOverrides.threadId, threadId))
      .orderBy(desc(contentAnalysisOverrides.createdAt))
      .limit(1);
    return toAnalysisDetails(row, overrideRow?.decision as AnalysisOverrideDecision | undefined ?? null);
  }

  async findLatestStatusByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, "succeeded" | "failed">> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn(
        [contentAnalysisRuns.threadId],
        {
          threadId: contentAnalysisRuns.threadId,
          status: contentAnalysisRuns.status,
          createdAt: contentAnalysisRuns.createdAt,
        },
      )
      .from(contentAnalysisRuns)
      .where(
        and(
          inArray(contentAnalysisRuns.threadId, [...threadIds]),
          inArray(contentAnalysisRuns.status, ["succeeded", "failed"]),
        ),
      )
      .orderBy(
        contentAnalysisRuns.threadId,
        desc(contentAnalysisRuns.createdAt),
      );

    const statuses = new Map<string, "succeeded" | "failed">();
    for (const row of rows) {
      statuses.set(
        row.threadId,
        row.status === "failed" ? "failed" : "succeeded",
      );
    }
    return statuses;
  }

  async saveOverride(input: SaveOverrideInput): Promise<ContentAnalysisOverride> {
    const id = input.id;
    const [row] = await this.db
      .insert(contentAnalysisOverrides)
      .values({
        id,
        threadId: input.threadId,
        decision: input.decision,
        actorId: input.actorId,
        reason: input.reason,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .returning();
    if (row === undefined) {
      throw new Error("failed to persist content-analysis override");
    }
    return toOverride(row);
  }

  async findOverriddenThreadIds(
    threadIds: readonly string[],
  ): Promise<Set<string>> {
    if (threadIds.length === 0) return new Set();
    const rows = await this.db
      .select({ threadId: contentAnalysisOverrides.threadId })
      .from(contentAnalysisOverrides)
      .where(inArray(contentAnalysisOverrides.threadId, [...threadIds]));
    return new Set(rows.map((row) => row.threadId));
  }

  async findLatestOverridesByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnalysisOverrideDecision>> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn(
        [contentAnalysisOverrides.threadId],
        {
          threadId: contentAnalysisOverrides.threadId,
          decision: contentAnalysisOverrides.decision,
          createdAt: contentAnalysisOverrides.createdAt,
        },
      )
      .from(contentAnalysisOverrides)
      .where(inArray(contentAnalysisOverrides.threadId, [...threadIds]))
      .orderBy(
        contentAnalysisOverrides.threadId,
        desc(contentAnalysisOverrides.createdAt),
      );
    const overrides = new Map<string, AnalysisOverrideDecision>();
    for (const row of rows) {
      overrides.set(row.threadId, row.decision as AnalysisOverrideDecision);
    }
    return overrides;
  }

  async findNextRunNumber(sourceEventId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: max(contentAnalysisRuns.runNumber) })
      .from(contentAnalysisRuns)
      .where(eq(contentAnalysisRuns.sourceEventId, sourceEventId));
    return (row?.max ?? 0) + 1;
  }
}

function toAnalysisDetails(
  row: RunRow,
  override: AnalysisOverrideDecision | null = null,
): ThreadAnalysisDetails {
  return {
    runId: row.id,
    status: row.status === "failed" ? "failed" : "succeeded",
    decision: row.decision as ThreadAnalysisDetails["decision"],
    override,
    sentiment:
      row.sentimentLabel !== null && row.confidence !== null
        ? {
            label: row.sentimentLabel as SentimentLabel,
            confidence: row.confidence,
          }
        : null,
    findings: row.findings as ContentAnalysisFinding[] | null,
    summary: row.summary,
    rationale: row.rationale,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
  };
}

type RunRow = typeof contentAnalysisRuns.$inferSelect;

type OverrideRow = typeof contentAnalysisOverrides.$inferSelect;

function toOverride(row: OverrideRow): ContentAnalysisOverride {
  return {
    id: row.id,
    threadId: row.threadId,
    decision: row.decision as ContentAnalysisOverride["decision"],
    actorId: row.actorId,
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRun(row: RunRow): ContentAnalysisRun {
  return {
    id: row.id,
    sourceEventId: row.sourceEventId,
    runNumber: row.runNumber,
    triggerType: row.triggerType as ContentAnalysisRun["triggerType"],
    threadId: row.threadId,
    reportId: row.reportId,
    status: row.status as ContentAnalysisRun["status"],
    decision: row.decision as ContentAnalysisRun["decision"],
    inputHash: row.inputHash ?? "",
    modelId: row.modelId,
    lambdaFunctionVersion: row.lambdaFunctionVersion,
    createdAt: row.createdAt,
  };
}
