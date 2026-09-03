import { describe, expect, it, vi } from "vitest";

import { processWorkflowEvent, type WorkflowDependencies, type WorkflowEvent } from "./handler";
import type { RefreshRunRecord } from "../../modules/analytics/application/refresh-run.ports";
import type { AthenaActionMetricRow } from "../../modules/analytics/application/refresh-run.ports";

describe("analytics workflow handler - processWorkflowEvent", () => {
  const runId = "adadcc95-0441-4667-a03a-a9eb16fbc934";

  const sampleActionRows: readonly AthenaActionMetricRow[] = [
    {
      metricKind: "activity",
      grain: "platform",
      societyId: null,
      targetType: null,
      targetId: null,
      threadId: null,
      periodStart: new Date("2026-09-03T00:00:00.000Z"),
      periodEnd: new Date("2026-09-04T00:00:00.000Z"),
      snapshotAt: null,
      data: {
        eventCounts: {
          comment_created: 0,
          comment_deleted: 0,
          comment_edited: 0,
          comment_reaction_changed: 0,
          moderation_content_removed: 0,
          moderation_report_decided: 0,
          report_created: 0,
          society_membership_activated: 0,
          society_membership_banned: 0,
          society_membership_joined: 0,
          society_membership_left: 0,
          thread_created: 0,
          thread_deleted: 0,
          thread_edited: 0,
          thread_reaction_changed: 6,
        },
        distinctActors: 1,
        likesAdded: 5,
        likesRemoved: 0,
        dislikesAdded: 1,
        dislikesRemoved: 0,
        reactionScoreDelta: 3,
        joins: 0,
        leaves: 0,
        activations: 0,
        bans: 0,
        activeMembershipDelta: 0,
        firstActivityAt: "2026-09-03T09:24:48.340Z",
        lastActivityAt: "2026-09-03T09:25:12.123Z",
      },
    },
    {
      metricKind: "current_state",
      grain: "platform",
      societyId: null,
      targetType: null,
      targetId: null,
      threadId: null,
      periodStart: new Date("2026-09-03T00:00:00.000Z"),
      periodEnd: new Date("2026-09-04T00:00:00.000Z"),
      snapshotAt: new Date("2026-09-04T00:00:00.000Z"),
      data: {
        snapshotAt: "2026-09-04T00:00:00.000Z",
        positiveReactions: 388,
        negativeReactions: 103,
        reactionScore: 285,
        activeMemberships: 43,
      },
    },
    {
      metricKind: "current_state",
      grain: "society",
      societyId: "a9846cb7-e5dc-45ee-8056-2ddbb267aa4a",
      targetType: null,
      targetId: null,
      threadId: null,
      periodStart: new Date("2026-09-03T00:00:00.000Z"),
      periodEnd: new Date("2026-09-04T00:00:00.000Z"),
      snapshotAt: new Date("2026-09-04T00:00:00.000Z"),
      data: {
        snapshotAt: "2026-09-04T00:00:00.000Z",
        positiveReactions: 100,
        negativeReactions: 16,
        reactionScore: 84,
        activeMemberships: 88,
      },
    },
  ];

  function createMockDependencies(initialRun?: RefreshRunRecord): {
    dependencies: WorkflowDependencies;
    savedRuns: RefreshRunRecord[];
    upsertedActionMetrics: unknown[];
    deletedBefore: Date[];
  } {
    const savedRuns: RefreshRunRecord[] = [];
    const upsertedActionMetrics: unknown[] = [];
    const deletedBefore: Date[] = [];
    let currentRun = initialRun ?? {
      runId,
      trigger: "admin",
      contractVersion: 2,
      periodStart: "2026-09-03",
      periodEnd: "2026-09-04",
      createdAt: new Date("2026-09-03T14:45:00.000Z"),
      updatedAt: new Date("2026-09-03T14:45:00.000Z"),
      status: "querying",
      attempts: 0,
      lastError: null,
      glueJobRunId: "jr_123",
      athenaQueryExecutionIds: {},
    };

    const dependencies: WorkflowDependencies = {
      runStore: {
        get: vi.fn(async (id: string) => (id === currentRun.runId ? currentRun : null)),
        save: vi.fn(async (record: RefreshRunRecord) => {
          currentRun = record;
          savedRuns.push(record);
          return record;
        }),
      },
      repository: {
        upsertActionMetrics: vi.fn(async (metrics) => {
          upsertedActionMetrics.push(...metrics);
        }),
        upsertMetrics: vi.fn(async () => []),
        deleteIngestedBefore: vi.fn(async (before) => {
          deletedBefore.push(before);
          return 0;
        }),
      },
      athena: {
        getActionResults: vi.fn(async (queryId: string) => {
          if (queryId === "query-activity") return [sampleActionRows[0]!];
          if (queryId === "query-current-state") return [sampleActionRows[1]!, sampleActionRows[2]!];
          if (queryId === "query-reconciliation") return [];
          return [];
        }),
        getResults: vi.fn(async () => []),
      },
    };

    return { dependencies, savedRuns, upsertedActionMetrics, deletedBefore };
  }

  it("persists v2 action metrics and completes the refresh run", async () => {
    const { dependencies, savedRuns, upsertedActionMetrics, deletedBefore } = createMockDependencies();

    const event: WorkflowEvent = {
      action: "persist",
      runId,
      queryExecutionIds: [
        { metricType: "activity", queryExecutionId: "query-activity" },
        { metricType: "current_state", queryExecutionId: "query-current-state" },
        { metricType: "reconciliation", queryExecutionId: "query-reconciliation" },
      ],
    };

    const result = await processWorkflowEvent(event, dependencies);

    expect(result).toEqual({ runId, status: "completed" });
    expect(upsertedActionMetrics).toHaveLength(3);
    expect(deletedBefore).toHaveLength(1);

    const lastSaved = savedRuns.at(-1);
    expect(lastSaved).toBeDefined();
    expect(lastSaved?.status).toBe("completed");
    expect(lastSaved?.lastError).toBeNull();
    expect(lastSaved?.athenaQueryExecutionIds).toEqual({
      activity: "query-activity",
      current_state: "query-current-state",
      reconciliation: "query-reconciliation",
    });
  });

  it("fails persist when queryExecutionIds are empty", async () => {
    const { dependencies } = createMockDependencies();

    const event: WorkflowEvent = {
      action: "persist",
      runId,
      queryExecutionIds: [],
    };

    await expect(processWorkflowEvent(event, dependencies)).rejects.toThrow(
      "workflow persist event is missing Athena query IDs",
    );
  });

  it("throws when refresh run is not found", async () => {
    const { dependencies } = createMockDependencies();

    const event: WorkflowEvent = {
      action: "persist",
      runId: "00000000-0000-0000-0000-000000000000",
      queryExecutionIds: [{ metricType: "activity", queryExecutionId: "q1" }],
    };

    await expect(processWorkflowEvent(event, dependencies)).rejects.toThrow(
      "analytics refresh run 00000000-0000-0000-0000-000000000000 was not found",
    );
  });

  it("short-circuits when refresh run has been cancelled", async () => {
    const { dependencies, savedRuns } = createMockDependencies({
      runId,
      trigger: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "cancelled",
      attempts: 0,
      lastError: null,
      glueJobRunId: null,
      athenaQueryExecutionIds: {},
    });

    const event: WorkflowEvent = {
      action: "persist",
      runId,
      queryExecutionIds: [{ metricType: "activity", queryExecutionId: "q1" }],
    };

    const result = await processWorkflowEvent(event, dependencies);

    expect(result).toEqual({ runId, status: "cancelled" });
    expect(savedRuns).toHaveLength(0);
  });

  it("handles prepare action by returning SQL queries for v2", async () => {
    const { dependencies, savedRuns } = createMockDependencies({
      runId,
      trigger: "admin",
      contractVersion: 2,
      periodStart: "2026-09-03",
      periodEnd: "2026-09-04",
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "exporting",
      attempts: 0,
      lastError: null,
      glueJobRunId: null,
      athenaQueryExecutionIds: {},
    });

    const event: WorkflowEvent = {
      action: "prepare",
      runId,
      glueJobRunId: "glue-job-456",
    };

    const result = await processWorkflowEvent(event, dependencies);

    expect(result.runId).toBe(runId);
    expect(result.status).toBe("querying");
    expect(result.queries?.map((q) => q.metricType)).toEqual(["activity", "current_state", "reconciliation"]);
    expect(savedRuns.at(-1)?.glueJobRunId).toBe("glue-job-456");
  });

  it("handles mark action by updating status and lastError", async () => {
    const { dependencies, savedRuns } = createMockDependencies();

    const event: WorkflowEvent = {
      action: "mark",
      runId,
      status: "failed",
      lastError: "Glue job timed out",
    };

    const result = await processWorkflowEvent(event, dependencies);

    expect(result).toEqual({ runId, status: "failed" });
    expect(savedRuns.at(-1)?.status).toBe("failed");
    expect(savedRuns.at(-1)?.lastError).toBe("Glue job timed out");
  });
});
