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
  | "reanalysis";

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

export type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";

export type Severity = "low" | "medium" | "high";

export type FindingSource =
  | "title"
  | "body"
  | "image"
  | "comment";

export interface ContentAnalysisResult {
  decision: AnalysisDecision;
  sentiment: {
    label: SentimentLabel;
    confidence: number;
  };
  findings: Array<{
    category: string;
    severity: Severity;
    confidence: number;
    source: FindingSource;
    sourceId?: string;
    evidence: string;
  }>;
  summary: string;
  rationale: string;
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
