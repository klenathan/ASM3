import type {
  AnalysisOverrideDecision,
  ContentAnalysisOverride,
  ContentAnalysisRun,
} from "../domain/content-analysis";
import type {
  AnalysisDecision,
  SentimentLabel,
  ThreadAnalysisDetails,
} from "./content-analysis.dto";
/**
 * Repository port for content-analysis runs. Lives on the
 * application/domain boundary; Drizzle implementation is in infrastructure.
 */
export interface RecordRunResultInput {
  readonly id: string;
  readonly decision: AnalysisDecision;
  readonly sentimentLabel: SentimentLabel | null;
  readonly confidence: number | null;
  readonly findings: unknown[] | null;
  readonly summary: string | null;
  readonly rationale: string | null;
  readonly modelId: string | null;
  readonly lambdaFunctionVersion: string | null;
  readonly lambdaRequestId: string | null;
  readonly providerRequestId: string | null;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly completedAt: Date;
}

export interface RecordRunFailureInput {
  readonly id: string;
  readonly errorCode: string;
  readonly completedAt: Date;
}

export interface ContentAnalysisRepository {
  create(run: ContentAnalysisRun): Promise<ContentAnalysisRun>;
  findById(id: string): Promise<ContentAnalysisRun | null>;
  findBySourceEvent(sourceEventId: string): Promise<ContentAnalysisRun[]>;
  markStarted(id: string, startedAt: Date): Promise<void>;
  recordSuccess(input: RecordRunResultInput): Promise<void>;
  recordFailure(input: RecordRunFailureInput): Promise<void>;
  /**
   * Return non-terminal runs (queued/running) whose run was created before
   * `olderThan`. Ordered oldest-first and bounded by `limit` so each scheduler
   * tick retries the most stale backlog first.
   */
  findStalePending(olderThan: Date, limit?: number): Promise<ContentAnalysisRun[]>;
  findLatestDecisionsByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnalysisDecision>>;
  findLatestSucceededAnalysis(
    threadId: string,
  ): Promise<ThreadAnalysisDetails | null>;

  /**
   * Persist a human override of the automated decision for a thread. The
   * newest override per thread is authoritative.
   */
  saveOverride(input: SaveOverrideInput): Promise<ContentAnalysisOverride>;

  /**
   * Return the set of thread IDs that have at least one recorded human
   * override. Used to drop already-resolved threads from the review queue.
   */
  findOverriddenThreadIds(threadIds: readonly string[]): Promise<Set<string>>;

  /**
   * Return the latest human override per thread, keyed by thread ID (only
   * threads with an override are present).
   */
  findLatestOverridesByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnalysisOverrideDecision>>;

  /** Return the next run number to use for a reanalysis of `sourceEventId`. */
  findNextRunNumber(sourceEventId: string): Promise<number>;
}

export interface SaveOverrideInput {
  readonly id: string;
  readonly threadId: string;
  readonly decision: AnalysisOverrideDecision;
  readonly actorId: string;
  readonly reason: string | null;
  readonly createdAt: Date;
}
