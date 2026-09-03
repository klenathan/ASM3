import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import { AnalyticsRefreshBusyError } from "../domain/analytics.errors";
import { normalizeRefreshRange, previousUtcDay, type RefreshRange } from "./refresh-range";
import type { RefreshRunRecord, RefreshRunStore, RefreshRunTrigger } from "./refresh-run.ports";

export interface RefreshWorkflowStarter {
  start(input: {
    readonly runId: string;
    readonly trigger: RefreshRunTrigger;
    readonly contractVersion: 2;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly snapshotAt: string;
  }): Promise<string>;
}

export interface RequestRefreshResult {
  readonly runId: string;
  readonly status: RefreshRunRecord["status"];
  readonly coalesced: boolean;
  readonly periodStart?: string;
  readonly periodEnd?: string;
}

/** Creates durable refresh records and starts one managed workflow per run. */
export class AnalyticsRefreshWorkflow {
  private readonly runStore: RefreshRunStore;
  private readonly starter: RefreshWorkflowStarter | undefined;
  private readonly clock: Clock;
  private requestLock = Promise.resolve();

  constructor(options: { readonly runStore: RefreshRunStore; readonly starter?: RefreshWorkflowStarter; readonly clock?: Clock }) {
    this.runStore = options.runStore;
    this.starter = options.starter;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  async requestRefresh(trigger: RefreshRunTrigger, requestedRange?: RefreshRange): Promise<RequestRefreshResult> {
    const previousRequest = this.requestLock;
    let releaseRequest: (() => void) | undefined;
    this.requestLock = new Promise<void>((resolve) => { releaseRequest = resolve; });
    await previousRequest;
    try {
      const range = normalizeRefreshRange(requestedRange ?? previousUtcDay(this.clock.now()), this.clock.now());
      const existing = await this.runStore.findActiveRun();
      if (existing !== null) {
        if (
          existing.contractVersion === undefined ||
          (existing.contractVersion === 2 &&
            existing.periodStart === range.periodStart &&
            existing.periodEnd === range.periodEnd)
        ) {
          return {
            runId: existing.runId,
            status: existing.status,
            coalesced: true,
            ...(requestedRange === undefined ? {} : { periodStart: range.periodStart, periodEnd: range.periodEnd }),
          };
        }
        throw new AnalyticsRefreshBusyError(existing);
      }
      const createdAt = this.clock.now();
      const run: RefreshRunRecord = {
        runId: randomUUID(),
        trigger,
        contractVersion: 2,
        periodStart: range.periodStart,
        periodEnd: range.periodEnd,
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
        if (
          saved.contractVersion === undefined ||
          (saved.contractVersion === 2 &&
            saved.periodStart === range.periodStart &&
            saved.periodEnd === range.periodEnd)
        ) {
          return {
            runId: saved.runId,
            status: saved.status,
            coalesced: true,
            ...(requestedRange === undefined ? {} : { periodStart: range.periodStart, periodEnd: range.periodEnd }),
          };
        }
        throw new AnalyticsRefreshBusyError(saved);
      }
      if (this.starter === undefined) {
        return { runId: saved.runId, status: saved.status, coalesced: false, periodStart: range.periodStart, periodEnd: range.periodEnd };
      }
      try {
        await this.starter.start({ runId: saved.runId, trigger: saved.trigger, contractVersion: 2, periodStart: range.periodStart, periodEnd: range.periodEnd, snapshotAt: snapshotPartition(saved.createdAt) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.runStore.save({ ...saved, status: "failed", lastError: `workflow start failed: ${message}`, updatedAt: this.clock.now() });
        throw error;
      }
      return { runId: saved.runId, status: saved.status, coalesced: false, periodStart: range.periodStart, periodEnd: range.periodEnd };
    } finally {
      releaseRequest?.();
    }
  }
}

function snapshotPartition(createdAt: Date): string {
  return createdAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
