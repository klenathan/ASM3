import { randomUUID } from "node:crypto";

export const REANALYSIS_JOB_TYPE = "thread.reanalysis.requested";
export const REANALYSIS_JOB_VERSION = 1;

export interface ReanalysisJob {
  readonly jobId: string;
  readonly jobType: typeof REANALYSIS_JOB_TYPE;
  readonly version: typeof REANALYSIS_JOB_VERSION;
  readonly threadId: string;
  readonly requestedAt: string;
}

export interface ReanalysisJobPublisher {
  enqueueReanalysis(threadId: string): Promise<void>;
}

export interface ReanalysisMessage {
  readonly receiptHandle: string;
  readonly body: string;
}

export interface ReanalysisMessageSource {
  receive(signal: AbortSignal): Promise<readonly ReanalysisMessage[]>;
  acknowledge(receiptHandle: string): Promise<void>;
}

export function buildReanalysisJob(threadId: string): ReanalysisJob {
  return {
    jobId: randomUUID(),
    jobType: REANALYSIS_JOB_TYPE,
    version: REANALYSIS_JOB_VERSION,
    threadId,
    requestedAt: new Date().toISOString(),
  };
}
