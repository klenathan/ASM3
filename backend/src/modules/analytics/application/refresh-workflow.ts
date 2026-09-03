import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import type {
  RefreshRunRecord,
  RefreshRunStore,
  RefreshRunTrigger,
} from "./refresh-run.ports";

export interface RefreshWorkflowStarter {
  start(input: {
    readonly runId: string;
    readonly trigger: RefreshRunTrigger;
    readonly snapshotAt: string;
  }): Promise<string>;
}

export interface RequestRefreshResult {
  readonly runId: string;
  readonly status: RefreshRunRecord["status"];
  readonly coalesced: boolean;
}

/** Creates durable refresh records and starts one managed workflow per run. */
export class AnalyticsRefreshWorkflow {
  private readonly runStore: RefreshRunStore;
  private readonly starter: RefreshWorkflowStarter | undefined;
  private readonly clock: Clock;
  private requestLock = Promise.resolve();

  constructor(options: {
    readonly runStore: RefreshRunStore;
    readonly starter?: RefreshWorkflowStarter | undefined;
    readonly clock?: Clock | undefined;
  }) {
    this.runStore = options.runStore;
    this.starter = options.starter;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  async requestRefresh(trigger: RefreshRunTrigger): Promise<RequestRefreshResult> {
    const previousRequest = this.requestLock;
    let releaseRequest: (() => void) | undefined;
    this.requestLock = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await previousRequest;

    try {
      const existing = await this.runStore.findActiveRun();
      if (existing !== null) {
        return {
          runId: existing.runId,
          status: existing.status,
          coalesced: true,
        };
      }

      const createdAt = this.clock.now();
      const run: RefreshRunRecord = {
        runId: randomUUID(),
        trigger,
        createdAt,
        updatedAt: createdAt,
        status: "requested",
        attempts: 0,
        lastError: null,
        glueJobRunId: null,
        athenaQueryExecutionIds: {},
      };
      const saved = await this.runStore.save(run);
      if (saved.runId !== run.runId) {
        return { runId: saved.runId, status: saved.status, coalesced: true };
      }

      if (this.starter === undefined) {
        return { runId: saved.runId, status: saved.status, coalesced: false };
      }

      try {
        await this.starter.start({
          runId: saved.runId,
          trigger: saved.trigger,
          snapshotAt: snapshotPartition(saved.createdAt),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.runStore.save({
          ...saved,
          status: "failed",
          lastError: `workflow start failed: ${message}`,
          updatedAt: this.clock.now(),
        });
        throw error;
      }

      return { runId: saved.runId, status: saved.status, coalesced: false };
    } finally {
      releaseRequest?.();
    }
  }
}

function snapshotPartition(createdAt: Date): string {
  return createdAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
