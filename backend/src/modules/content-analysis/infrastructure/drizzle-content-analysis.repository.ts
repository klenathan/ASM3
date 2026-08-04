import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ContentAnalysisRepository,
  RecordRunFailureInput,
  RecordRunResultInput,
} from "../application/content-analysis.repository";
import type {
  ContentAnalysisFinding,
  SentimentLabel,
  ThreadAnalysisDetails,
} from "../application/content-analysis.dto";
import type { ContentAnalysisRun } from "../domain/content-analysis";
import { contentAnalysisRuns } from "./content-analysis.tables";

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

  async findLatestSucceededAnalysis(
    threadId: string,
  ): Promise<ThreadAnalysisDetails | null> {
    const [row] = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(
        and(
          eq(contentAnalysisRuns.threadId, threadId),
          eq(contentAnalysisRuns.status, "succeeded"),
          isNotNull(contentAnalysisRuns.decision),
        ),
      )
      .orderBy(desc(contentAnalysisRuns.createdAt))
      .limit(1);
    return row === undefined ? null : toAnalysisDetails(row);
  }
}

function toAnalysisDetails(row: RunRow): ThreadAnalysisDetails {
  return {
    runId: row.id,
    decision: row.decision as ThreadAnalysisDetails["decision"],
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
