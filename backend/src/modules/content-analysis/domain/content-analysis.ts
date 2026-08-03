/**
 * Content-analysis domain model. Statuses and decisions are owned here.
 */

export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type AnalysisTriggerType =
  | "thread_created"
  | "thread_updated"
  | "report_created"
  | "reanalysis";

export interface ContentAnalysisRun {
  id: string;
  sourceEventId: string;
  runNumber: number;
  triggerType: AnalysisTriggerType;
  threadId: string;
  reportId: string | null;
  status: AnalysisRunStatus;
  decision: "allow" | "review" | null;
  inputHash: string;
  modelId: string | null;
  lambdaFunctionVersion: string | null;
  createdAt: Date;
}

// TODO(phase 2): status-transition guards and invariants.
