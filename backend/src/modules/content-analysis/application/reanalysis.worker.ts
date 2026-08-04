import type { Logger } from "pino";
import { z } from "zod";

import type {
  ReanalysisMessage,
  ReanalysisMessageSource,
} from "./reanalysis-queue.port";
import {
  REANALYSIS_JOB_TYPE,
  REANALYSIS_JOB_VERSION,
} from "./reanalysis-queue.port";

const reanalysisJobSchema = z.object({
  jobId: z.string().uuid(),
  jobType: z.literal(REANALYSIS_JOB_TYPE),
  version: z.literal(REANALYSIS_JOB_VERSION),
  threadId: z.string().uuid(),
  requestedAt: z.string().datetime(),
}).strict();

export interface ReanalysisRunner {
  reanalyzeThread(threadId: string): Promise<unknown>;
}

export interface ReanalysisWorkerDependencies {
  readonly source: ReanalysisMessageSource;
  readonly runner: ReanalysisRunner;
  readonly logger: Logger;
}

/**
 * Long-polling worker used by the existing ECS backend task. SQS owns retry
 * and dead-letter behavior; a message is acknowledged only after the service
 * has created and settled its analysis run.
 */
export class ReanalysisWorker {
  private readonly source: ReanalysisMessageSource;
  private readonly runner: ReanalysisRunner;
  private readonly logger: Logger;
  private readonly controller = new AbortController();
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(dependencies: ReanalysisWorkerDependencies) {
    this.source = dependencies.source;
    this.runner = dependencies.runner;
    this.logger = dependencies.logger;
  }

  start(): Promise<void> {
    if (this.loop !== null) return this.loop;
    this.running = true;
    this.loop = this.run();
    return this.loop;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.controller.abort();
    if (this.loop !== null) {
      await this.loop.catch(() => undefined);
      this.loop = null;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      let messages: readonly ReanalysisMessage[];
      try {
        messages = await this.source.receive(this.controller.signal);
      } catch (error) {
        if (this.controller.signal.aborted) return;
        this.logger.error({ err: error }, "failed to receive reanalysis jobs");
        continue;
      }

      for (const message of messages) {
        if (!await this.handleMessage(message)) continue;
        try {
          await this.source.acknowledge(message.receiptHandle);
        } catch (error) {
          this.logger.error(
            { err: error, receiptHandle: message.receiptHandle },
            "failed to acknowledge reanalysis job",
          );
        }
      }
    }
  }

  private async handleMessage(message: ReanalysisMessage): Promise<boolean> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.body);
    } catch {
      this.logger.error(
        { body: message.body },
        "received malformed reanalysis job; leaving unacknowledged",
      );
      return false;
    }

    const result = reanalysisJobSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        { body: message.body, issues: result.error.issues },
        "received invalid reanalysis job; leaving unacknowledged",
      );
      return false;
    }

    const job = result.data;
    try {
      await this.runner.reanalyzeThread(job.threadId);
      this.logger.info(
        { jobId: job.jobId, threadId: job.threadId },
        "completed queued thread reanalysis",
      );
      return true;
    } catch (error) {
      // Leave the message visible after the SQS visibility timeout so a
      // transient database or service failure can be retried/DLQ'd.
      this.logger.error(
        { err: error, jobId: job.jobId, threadId: job.threadId },
        "failed queued thread reanalysis",
      );
      return false;
    }
  }
}
