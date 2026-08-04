import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import type { Clock } from "../../../shared/application/clock";
import type { ContentAnalyzerPort } from "./content-analyzer.port";
import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "./content-analysis.dto";
import type { ContentAnalysisRepository } from "./content-analysis.repository";
import type { ReportAnalysisContextPort } from "./report-analysis-context.port";
import type { ThreadAnalysisContextPort } from "./thread-analysis-context.port";
import {
  DEFAULT_STALE_PENDING_MS,
  DEFAULT_STALE_PENDING_LIMIT,
  type AnalysisOverrideDecision,
  type ContentAnalysisRun,
} from "../domain/content-analysis";

export type ContentAnalysisMode = "off" | "shadow" | "enforce";

export interface ContentAnalysisServiceDeps {
  repository: ContentAnalysisRepository;
  analyzer?: ContentAnalyzerPort;
  threadContext: ThreadAnalysisContextPort;
  reportContext?: ReportAnalysisContextPort;
  mode: ContentAnalysisMode;
  policyVersion: string;
  promptVersion: string;
  logger: Logger;
  clock: Clock;
}

/**
 * Orchestrates content analysis. Owns authorization, context rehydration,
 * invocation, result validation, and transactional persistence. Kept
 * framework-agnostic; inject dependencies explicitly.
 *
 * Modes:
 *  - off:      analysis is never triggered (local development default).
 *  - shadow:   analysis runs and is persisted, but does not change thread
 *              visibility. Used to measure real invocation before enforcement.
 *  - enforce:  analysis gates publication. Thread-status enforcement is
 *              deferred until `pending_analysis`/`pending_review` statuses are
 *              added to the thread schema; today it persists the result and
 *              leaves the thread published (same as shadow) with a warning.
 */
export class ContentAnalysisService {
  readonly deps: ContentAnalysisServiceDeps;

  constructor(deps: ContentAnalysisServiceDeps) {
    this.deps = deps;
  }

  /**
   * Analyze a newly created thread. Fire-and-forget friendly: never throws
   * for analysis failures (the run is recorded as failed), so callers can
   * trigger it without blocking thread creation. Returns the result when the
   * run succeeded, or null when analysis was skipped or failed.
   */
  async analyzeNewThread(
    threadId: string,
  ): Promise<ContentAnalysisResult | null> {
    if (this.deps.mode === "off") {
      return null;
    }

    const run = this.buildRun(threadId, "thread_created", 1);
    await this.deps.repository.create(run);
    return this.executeAnalysis(run);
  }

  /**
   * Explicitly re-run automated analysis on an existing thread. Creates a new
   * run with the next run number and reuses the same pipeline as
   * {@link analyzeNewThread}. Never throws on analysis failure. Returns the
   * new result when the run succeeded, or null when skipped/failed.
   */
  async reanalyzeThread(
    threadId: string,
  ): Promise<ContentAnalysisResult | null> {
    if (this.deps.mode === "off") {
      return null;
    }
    const runNumber = await this.deps.repository.findNextRunNumber(threadId);
    const run = this.buildRun(threadId, "reanalysis", runNumber);
    await this.deps.repository.create(run);
    return this.executeAnalysis(run);
  }

  /**
   * Record a human override of the automated decision for a thread. The
   * calling moderation use case has already authorized the actor and applied
   * any thread-visibility transition; this persists the authoritative
   * override so the thread leaves the pending review queue.
   */
  async overrideThread(
    threadId: string,
    decision: AnalysisOverrideDecision,
    actorId: string,
    reason: string | null,
  ): Promise<void> {
    await this.deps.repository.saveOverride({
      id: randomUUID(),
      threadId,
      decision,
      actorId,
      reason: reason == null || reason.trim().length === 0
        ? null
        : reason.trim(),
      createdAt: this.deps.clock.now(),
    });
  }

  /**
   * Retry pending runs that have been stuck (still queued/running) longer than
   * the stale threshold, typically because a previous synchronous Lambda
   * invocation hung or was aborted without settling the run. Re-invokes the
   * analyzer for each stale run and settles it to succeeded/failed. Runs that
   * remain non-terminal after this pass are picked up again on the next
   * scheduler tick, which satisfies the "trigger the job again if still
   * pending" requirement.
   *
   * Returns the number of stale runs re-triggered. No-op when analysis is off
   * or no analyzer is configured.
   */
  async retryStaleRuns(options?: {
    staleAfterMs?: number;
    limit?: number;
  }): Promise<number> {
    if (this.deps.mode === "off" || this.deps.analyzer === undefined) {
      return 0;
    }
    const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_PENDING_MS;
    const olderThan = new Date(
      this.deps.clock.now().getTime() - staleAfterMs,
    );
    const runs = await this.deps.repository.findStalePending(
      olderThan,
      options?.limit ?? DEFAULT_STALE_PENDING_LIMIT,
    );
    for (const run of runs) {
      this.deps.logger.info(
        { runId: run.id, threadId: run.threadId, status: run.status },
        "retrying stale pending content-analysis run",
      );
      await this.executeAnalysis(run);
    }
    return runs.length;
  }

  /**
   * Run analysis for an already-created run and settle it to succeeded or
   * failed. Shared by fresh thread triggers and stale-run retries.
   */
  private async executeAnalysis(
    run: ContentAnalysisRun,
  ): Promise<ContentAnalysisResult | null> {
    const { threadId } = run;
    const startedAt = this.deps.clock.now();
    try {
      const context = await this.deps.threadContext.loadThreadContext(threadId);
      const request = this.buildThreadRequest(context, run.triggerType);
      await this.deps.repository.markStarted(run.id, startedAt);

      const invocation = await this.deps.analyzer!.analyze(request);

      await this.deps.repository.recordSuccess({
        id: run.id,
        decision: invocation.result.decision,
        sentimentLabel: invocation.result.sentiment.label,
        confidence: invocation.result.sentiment.confidence,
        findings: invocation.result.findings,
        summary: invocation.result.summary,
        rationale: invocation.result.rationale,
        modelId: invocation.modelId,
        lambdaFunctionVersion: invocation.lambdaFunctionVersion,
        lambdaRequestId: invocation.lambdaRequestId,
        providerRequestId: invocation.providerRequestId,
        promptVersion: this.deps.promptVersion,
        policyVersion: this.deps.policyVersion,
        completedAt: this.deps.clock.now(),
      });

      if (
        this.deps.mode === "enforce" &&
        invocation.result.decision === "review"
      ) {
        // TODO(phase 3): transition thread to `pending_review` and surface in
        // moderation. Requires extending the thread status schema.
        this.deps.logger.warn(
          { threadId, runId: run.id },
          "content analysis returned review but enforce transition is not yet wired",
        );
      }

      return invocation.result;
    } catch (error) {
      const errorCode =
        this.deps.logger.level === "debug"
          ? "ANALYSIS_INVOCATION_FAILED"
          : classifyError(error);
      try {
        await this.deps.repository.recordFailure({
          id: run.id,
          errorCode,
          completedAt: this.deps.clock.now(),
        });
      } catch (persistError) {
        this.deps.logger.error(
          { runId: run.id, error: persistError },
          "failed to persist content-analysis failure",
        );
      }
      this.deps.logger.warn(
        { threadId, runId: run.id, errorCode, error: String(error) },
        "content analysis failed; thread left as-is",
      );
      return null;
    }
  }

  private buildRun(
    threadId: string,
    triggerType: ContentAnalysisRun["triggerType"],
    runNumber: number,
  ): ContentAnalysisRun {
    return {
      id: randomUUID(),
      sourceEventId: threadId,
      runNumber,
      triggerType,
      threadId,
      reportId: null,
      status: "queued",
      decision: null,
      inputHash: "",
      modelId: null,
      lambdaFunctionVersion: null,
      createdAt: this.deps.clock.now(),
    };
  }

  private buildThreadRequest(context: {
    threadId: string;
    title: string;
    body: string;
    globalPolicy: string;
    societyRules: Array<{ id: string; title: string; description: string }>;
    images: Array<{
      bucket: string;
      key: string;
      contentType: string;
      byteSize: number;
    }>;
  }, triggerType: ContentAnalysisRun["triggerType"]): ContentAnalysisRequest {
    const request: ContentAnalysisRequest = {
      analysisId: randomUUID(),
      triggerType,
      policyVersion: this.deps.policyVersion,
      promptVersion: this.deps.promptVersion,
      globalPolicy: context.globalPolicy,
      societyRules: context.societyRules,
      content: {
        title: context.title,
        body: context.body,
        comments: [],
      },
      images: context.images,
      engagement: {
        upvotes: 0,
        downvotes: 0,
        netScore: 0,
        visibleCommentCount: 0,
        contextTruncated: false,
      },
      contextCapturedAt: this.deps.clock.now().toISOString(),
    };
    return request;
  }
}

function classifyError(error: unknown): string {
  const value = error as { code?: unknown };
  if (typeof value?.code === "string" && value.code) return value.code;
  return "ANALYSIS_INVOCATION_FAILED";
}
