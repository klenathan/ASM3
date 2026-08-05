/**
 * Analysis request/response contracts shared between the backend adapter and
 * the Lambda function. Keep these aligned with the Lambda-side contracts in
 * backend/src/functions/content-analysis/contracts.ts.
 *
 * Serialized and passed over the Lambda synchronous invocation payload.
 * Never include image bytes, presigned URLs, or voter identities.
 */

export type AnalysisTriggerType =
  | "thread_created"
  | "thread_updated"
  | "report_created"
  | "reanalysis"
  | "backfill";

export interface ContentAnalysisRequest {
  analysisId: string;
  triggerType: AnalysisTriggerType;
  policyVersion: string;
  promptVersion: string;
  globalPolicy: string;
  societyRules: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  content: {
    title?: string;
    body?: string;
    reportReason?: string;
    reportDetails?: string;
    comments: Array<{ id: string; body: string; score: number }>;
  };
  images: Array<{
    bucket: string;
    key: string;
    contentType: string;
    byteSize: number;
  }>;
  engagement: {
    upvotes: number;
    downvotes: number;
    netScore: number;
    visibleCommentCount: number;
    contextTruncated: boolean;
  };
  contextCapturedAt: string;
}

export type AnalysisDecision = "allow" | "review";

/** Human override of the automated decision: `accept` approves, `reject` hides. */
export type AnalysisOverrideDecision = "accept" | "reject";

export interface AnalysisThreadState {
  readonly status: "queued" | "running" | "succeeded" | "failed" | null;
  readonly decision: AnalysisDecision | null;
  readonly override: AnalysisOverrideDecision | null;
}

export type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";

export type Severity = "low" | "medium" | "high";

export type FindingSource =
  | "title"
  | "body"
  | "image"
  | "comment";

export interface ContentAnalysisFinding {
  category: string;
  severity: Severity;
  confidence: number;
  source: FindingSource;
  sourceId?: string;
  evidence: string;
}

export interface ContentAnalysisResult {
  decision: AnalysisDecision;
  sentiment: {
    label: SentimentLabel;
    confidence: number;
  };
  findings: ContentAnalysisFinding[];
  summary: string;
  rationale: string;
}

/**
 * The full, persisted outcome of the latest successful analysis run for a
 * single thread. Surfaces the evaluator's findings, sentiment, rationale and
 * provenance (model, prompt version) to a privileged reviewer.
 */
export interface ThreadAnalysisDetails {
  readonly runId: string;
  /** Terminal run status; `failed` when the latest settled run errored. */
  readonly status: "succeeded" | "failed";
  readonly decision: AnalysisDecision | null;
  /**
   * Latest human override for the thread, if any. `accept` approves the
   * review outcome; `reject` hides the thread. Null when no moderator/admin
   * has overridden the automated decision.
   */
  readonly override: AnalysisOverrideDecision | null;
  readonly sentiment: { label: SentimentLabel; confidence: number } | null;
  readonly findings: ContentAnalysisFinding[] | null;
  readonly summary: string | null;
  readonly rationale: string | null;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly completedAt: string | null;
}

/**
 * Result of a synchronous analyzer invocation, including correlation metadata
 * surfaced from the AWS Lambda response for audit evidence.
 */
export interface AnalysisInvocationResult {
  readonly result: ContentAnalysisResult;
  readonly modelId: string | null;
  readonly lambdaFunctionVersion: string | null;
  readonly lambdaRequestId: string | null;
  readonly providerRequestId: string | null;
}
