import { describe, expect, it } from "vitest";

import { ACTION_EVENT_TYPES } from "../domain/action-event";
import { actionMetricDataSchema } from "../domain/action-metrics";
import { parseActionAthenaResultRows } from "./athena-result-parser";

const columns = [
  "metric_kind",
  "grain",
  "society_id",
  "target_type",
  "target_id",
  "thread_id",
  "period_start",
  "period_end",
  "snapshot_at",
  "data",
];

describe("parseActionAthenaResultRows", () => {
  it("maps action query result columns", () => {
    expect(parseActionAthenaResultRows(columns, [[
      "activity", "platform", null, null, null, null, "2026-09-03T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z", null, '{"distinct_actors":0}',
    ]])).toMatchObject([{
      metricKind: "activity",
      grain: "platform",
      periodStart: new Date("2026-09-03T00:00:00.000Z"),
      periodEnd: new Date("2026-09-04T00:00:00.000Z"),
    }]);
  });

  it("normalizes action payloads for the domain schema", () => {
    const data = {
      event_counts: Object.fromEntries(ACTION_EVENT_TYPES.map((eventType) => [eventType, 0])),
      distinct_actors: 0,
      likes_added: 0,
      likes_removed: 0,
      dislikes_added: 0,
      dislikes_removed: 0,
      reaction_score_delta: 0,
      joins: 0,
      leaves: 0,
      activations: 0,
      bans: 0,
      active_membership_delta: 0,
      first_activity_at: "2026-09-03 13:28:43.000",
      last_activity_at: "2026-09-03 13:28:43.000",
    };
    const result = parseActionAthenaResultRows(columns, [[
      "activity", "platform", null, null, null, null, "2026-09-03T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z", null, JSON.stringify(data),
    ]]);

    expect(result[0]?.data).toMatchObject({
      eventCounts: Object.fromEntries(ACTION_EVENT_TYPES.map((eventType) => [eventType, 0])),
      distinctActors: 0,
      firstActivityAt: "2026-09-03T13:28:43.000Z",
      lastActivityAt: "2026-09-03T13:28:43.000Z",
    });
    expect(() => actionMetricDataSchema.parse({ metricKind: result[0]?.metricKind, data: result[0]?.data })).not.toThrow();
  });

  it("normalizes current-state and reconciliation payloads", () => {
    const rows = [
      ["current_state", "platform", null, null, null, null, "2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z", "2026-09-04T00:00:00.000Z", '{"snapshot_at":"2026-09-04 00:00:00.000","positive_reactions":3,"negative_reactions":1,"reaction_score":2,"active_memberships":4}'],
      ["reconciliation", "platform", null, null, null, null, "2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z", "2026-09-04T00:00:00.000Z", '{"status":"not_comparable","previous_snapshot_at":null,"current_snapshot_at":"2026-09-04 00:00:00.000","expected":0,"actual":0,"difference":0}'],
    ];
    for (const result of parseActionAthenaResultRows(columns, rows)) {
      expect(() => actionMetricDataSchema.parse({ metricKind: result.metricKind, data: result.data })).not.toThrow();
    }
  });
});
