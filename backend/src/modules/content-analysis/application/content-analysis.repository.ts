import type { ContentAnalysisRun } from "../domain/content-analysis";
import type {
  AnalysisDecision,
  SentimentLabel,
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
}
