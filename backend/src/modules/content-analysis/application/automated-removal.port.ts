import type { FindingSource } from "./content-analysis.dto";

export const AUTO_REMOVE_REASON_CODE = "high_severity_high_confidence" as const;
export const AUTO_REMOVED_EVENT_TYPE = "thread.auto_removed" as const;
export const AUTO_REMOVED_EVENT_VERSION = 1 as const;

export type AutoRemovalResult = "removed" | "already_inactive";

export interface AutoRemovalFinding {
  readonly category: string;
  readonly severity: "high";
  readonly confidence: number;
  readonly source: FindingSource;
  readonly sourceId?: string;
}

export interface RemoveThreadIfPublishedInput {
  readonly threadId: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly analysisRunId: string;
  readonly reasonCode: string;
  readonly threshold: number;
  readonly finding: AutoRemovalFinding;
  readonly modelId: string | null;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly occurredAtEpochMs: number;
}

export interface AutomatedRemovalPort {
  removeThreadIfPublished(input: RemoveThreadIfPublishedInput): Promise<AutoRemovalResult>;
}

export interface AutoRemovedEvent {
  readonly eventId: string;
  readonly eventType: typeof AUTO_REMOVED_EVENT_TYPE;
  readonly version: typeof AUTO_REMOVED_EVENT_VERSION;
  readonly threadId: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly analysisRunId: string;
  readonly reasonCode: string;
  readonly threshold: number;
  readonly finding: AutoRemovalFinding;
  readonly modelId: string | null;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly occurredAt: string;
}

export function buildAutoRemovedEvent(input: RemoveThreadIfPublishedInput): AutoRemovedEvent {
  return {
    eventId: input.analysisRunId,
    eventType: AUTO_REMOVED_EVENT_TYPE,
    version: AUTO_REMOVED_EVENT_VERSION,
    threadId: input.threadId,
    societyId: input.societyId,
    authorId: input.authorId,
    analysisRunId: input.analysisRunId,
    reasonCode: input.reasonCode,
    threshold: input.threshold,
    finding: input.finding,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    policyVersion: input.policyVersion,
    occurredAt: new Date(input.occurredAtEpochMs).toISOString(),
  };
}

export class NoopAutomatedRemoval implements AutomatedRemovalPort {
  async removeThreadIfPublished(): Promise<AutoRemovalResult> {
    return "already_inactive";
  }
}
