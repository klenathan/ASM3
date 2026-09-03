import { describe, expect, it } from "vitest";

import { parseActionAthenaResultRows, parseAthenaResultRows } from "./athena-result-parser";
import { actionMetricDataSchema } from "../domain/action-metrics";
import { ACTION_EVENT_TYPES } from "../domain/action-event";


describe("parseAthenaResultRows", () => {
  const columns = [
    "metric_type",
    "society_id",
    "period_start",
    "period_end",
    "data",
  ];

  it("skips the Athena header and maps rows into repository values", () => {
    const rows = [
      columns,
      [
        "user_growth",
        "",
        "2026-08-27T00:00:00.000Z",
        "2026-08-27T23:59:59.999Z",
        '{"registrations":12,"active_users":10,"total_users":30,"suspensions":1}',
      ],
    ];

    expect(parseAthenaResultRows(columns, rows)).toEqual([
      {
        metricType: "user_growth",
        societyId: null,
        periodStart: new Date("2026-08-27T00:00:00.000Z"),
        periodEnd: new Date("2026-08-27T23:59:59.999Z"),
        data: {
          registrations: 12,
          active_users: 10,
          total_users: 30,
          suspensions: 1,
        },
      },
    ]);
  });

  it("rejects malformed metric rows instead of persisting partial data", () => {
    expect(() =>
      parseAthenaResultRows(columns, [
        ["unknown_metric", "", "2026-08-27", "2026-08-27", "{}"],
      ]),
    ).toThrow("Invalid metric type");
  });

  it("rejects a payload that does not match its metric group", () => {
    expect(() =>
      parseAthenaResultRows(columns, [[
        "user_growth",
        "",
        "2026-08-27",
        "2026-08-27",
        '{"registrations":1}',
      ]]),
    ).toThrow("active_users");
  });

  it("allows null society IDs and rejects non-UUID society IDs", () => {
    const validRow = [
      "user_growth",
      "123e4567-e89b-12d3-a456-426614174000",
      "2026-08-27",
      "2026-08-27",
      '{"registrations":1,"active_users":1,"total_users":1,"suspensions":0}',
    ];
    expect(parseAthenaResultRows(columns, [validRow])[0]?.societyId).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
    expect(() => parseAthenaResultRows(columns, [[
      ...validRow.slice(0, 1),
      "society-1",
      ...validRow.slice(2),
    ]])).toThrow("invalid society_id");
    expect(parseAthenaResultRows(columns, [[
      ...validRow.slice(0, 1),
      null,
      ...validRow.slice(2),
    ]])[0]?.societyId).toBeNull();
  });
});

describe("parseActionAthenaResultRows", () => {
  it("maps the aliased action query result columns", () => {
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

    expect(parseActionAthenaResultRows(columns, [[
      "activity",
      "platform",
      null,
      null,
      null,
      null,
      "2026-09-03T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z",
      null,
      '{"distinct_actors":0}',
    ]])).toMatchObject([{
      metricKind: "activity",
      grain: "platform",
      periodStart: new Date("2026-09-03T00:00:00.000Z"),
      periodEnd: new Date("2026-09-04T00:00:00.000Z"),
    }]);
  });

  it("normalizes snake_case action payloads for the domain schema", () => {
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

    const result = parseActionAthenaResultRows([
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
    ], [[
      "activity",
      "platform",
      null,
      null,
      null,
      null,
      "2026-09-03T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z",
      null,
      JSON.stringify(data),
    ]]);

    expect(result[0]?.data).toEqual({
      eventCounts: Object.fromEntries(ACTION_EVENT_TYPES.map((eventType) => [eventType, 0])),
      distinctActors: 0,
      likesAdded: 0,
      likesRemoved: 0,
      dislikesAdded: 0,
      dislikesRemoved: 0,
      reactionScoreDelta: 0,
      joins: 0,
      leaves: 0,
      activations: 0,
      bans: 0,
      activeMembershipDelta: 0,
      firstActivityAt: "2026-09-03T13:28:43.000Z",
      lastActivityAt: "2026-09-03T13:28:43.000Z",
    });
    expect(() => actionMetricDataSchema.parse({
      metricKind: result[0]?.metricKind,
      data: result[0]?.data,
    })).not.toThrow();
  });
  it("normalizes current-state and reconciliation payloads", () => {
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
    const rows = [
      [
        "current_state",
        "platform",
        null,
        null,
        null,
        null,
        "2026-09-03T00:00:00.000Z",
        "2026-09-04T00:00:00.000Z",
        "2026-09-04T00:00:00.000Z",
        '{"snapshot_at":"2026-09-04 00:00:00.000","positive_reactions":3,"negative_reactions":1,"reaction_score":2,"active_memberships":4}',
      ],
      [
        "reconciliation",
        "platform",
        null,
        null,
        null,
        null,
        "2026-09-03T00:00:00.000Z",
        "2026-09-04T00:00:00.000Z",
        "2026-09-04T00:00:00.000Z",
        '{"status":"not_comparable","previous_snapshot_at":null,"current_snapshot_at":"2026-09-04 00:00:00.000","expected":0,"actual":0,"difference":0}',
      ],
    ];

    for (const result of parseActionAthenaResultRows(columns, rows)) {
      expect(() => actionMetricDataSchema.parse({
        metricKind: result.metricKind,
        data: result.data,
      })).not.toThrow();
    }
  });
});
