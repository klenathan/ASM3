import { describe, expect, it } from "vitest";

import { InMemoryRefreshRunStore } from "./refresh-run.store";
import { AnalyticsRefreshWorkflow } from "./refresh-workflow";

const clock = { now: () => new Date("2026-08-28T02:00:00.000Z") };

describe("AnalyticsRefreshWorkflow", () => {
  it("creates a durable run and starts one Step Functions execution", async () => {
    const store = new InMemoryRefreshRunStore();
    const starts: unknown[] = [];
    const workflow = new AnalyticsRefreshWorkflow({
      runStore: store,
      clock,
      starter: {
        start: async (input) => {
          starts.push(input);
          return "arn:aws:states:us-east-1:123:execution:analytics-refresh:run";
        },
      },
    });

    const result = await workflow.requestRefresh("admin");

    expect(result).toMatchObject({ status: "requested", coalesced: false });
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      trigger: "admin",
      snapshotAt: "20260828T020000Z",
      runId: result.runId,
    });
    await expect(store.get(result.runId)).resolves.toMatchObject({
      status: "requested",
      trigger: "admin",
    });
  });

  it("coalesces a refresh while another run is active", async () => {
    const store = new InMemoryRefreshRunStore();
    const workflow = new AnalyticsRefreshWorkflow({
      runStore: store,
      clock,
      starter: { start: async () => "execution-1" },
    });

    const first = await workflow.requestRefresh("admin");
    const second = await workflow.requestRefresh("nightly");

    expect(second).toEqual({
      runId: first.runId,
      status: "requested",
      coalesced: true,
    });
  });

  it("does not start a duplicate workflow after a database conflict", async () => {
    const existing = {
      runId: "123e4567-e89b-12d3-a456-426614174000",
      trigger: "admin" as const,
      createdAt: clock.now(),
      updatedAt: clock.now(),
      status: "exporting" as const,
      attempts: 0,
      lastError: null,
      glueJobRunId: null,
      athenaQueryExecutionIds: {},
    };
    let starts = 0;
    const workflow = new AnalyticsRefreshWorkflow({
      runStore: {
        findActiveRun: async () => null,
        findLatestRun: async () => existing,
        get: async () => existing,
        save: async () => existing,
      },
      starter: {
        start: async () => {
          starts += 1;
          return "execution-1";
        },
      },
      clock,
    });

    await expect(workflow.requestRefresh("nightly")).resolves.toEqual({
      runId: existing.runId,
      status: existing.status,
      coalesced: true,
    });
    expect(starts).toBe(0);
  });

  it("marks a run failed when Step Functions cannot start", async () => {
    const store = new InMemoryRefreshRunStore();
    const workflow = new AnalyticsRefreshWorkflow({
      runStore: store,
      clock,
      starter: {
        start: async () => { throw new Error("states unavailable"); },
      },
    });

    const request = workflow.requestRefresh("admin");

    await expect(request).rejects.toThrow("states unavailable");
    const run = await store.findLatestRun();
    expect(run).toMatchObject({ status: "failed", lastError: "workflow start failed: states unavailable" });
  });
});
