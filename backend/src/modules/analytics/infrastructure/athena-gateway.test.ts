import { describe, expect, it } from "vitest";

import { AthenaGatewayAdapter } from "./athena-gateway";

describe("AthenaGatewayAdapter", () => {
  it("reads all paginated result rows", async () => {
    let call = 0;
    const gateway = new AthenaGatewayAdapter(
      { region: "us-east-1" },
      async () => {
        call++;
        if (call === 1) {
          return {
            ResultSet: {
              ResultSetMetadata: {
                ColumnInfo: [
                  { Name: "metric_type" },
                  { Name: "society_id" },
                  { Name: "period_start" },
                  { Name: "period_end" },
                  { Name: "data" },
                ],
              },
              Rows: [
                { Data: ["metric_type", "society_id", "period_start", "period_end", "data"].map((VarCharValue) => ({ VarCharValue })) },
                { Data: ["user_growth", "", "2026-08-27", "2026-08-27", '{"registrations":1,"active_users":1,"total_users":1,"suspensions":0}'].map((VarCharValue) => ({ VarCharValue })) },
              ],
            },
            NextToken: "next",
          };
        }
        return {
          ResultSet: {
            Rows: [
              { Data: ["user_growth", "", "2026-08-28", "2026-08-28", '{"registrations":2,"active_users":2,"total_users":2,"suspensions":0}'].map((VarCharValue) => ({ VarCharValue })) },
            ],
          },
        };
      },
    );

    const rows = await gateway.getResults("query-1");

    expect(rows).toHaveLength(2);
    expect(rows[1]?.data).toEqual({
      registrations: 2,
      active_users: 2,
      total_users: 2,
      suspensions: 0,
    });
    expect(call).toBe(2);
  });
  it("reads and parses contract v2 action query results with null column cells", async () => {
    const gateway = new AthenaGatewayAdapter(
      { region: "us-east-1" },
      async () => ({
        ResultSet: {
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: "metric_kind" },
              { Name: "grain" },
              { Name: "society_id" },
              { Name: "target_type" },
              { Name: "target_id" },
              { Name: "thread_id" },
              { Name: "period_start" },
              { Name: "period_end" },
              { Name: "snapshot_at" },
              { Name: "data" },
            ],
          },
          Rows: [
            {
              Data: [
                { VarCharValue: "metric_kind" },
                { VarCharValue: "grain" },
                { VarCharValue: "society_id" },
                { VarCharValue: "target_type" },
                { VarCharValue: "target_id" },
                { VarCharValue: "thread_id" },
                { VarCharValue: "period_start" },
                { VarCharValue: "period_end" },
                { VarCharValue: "snapshot_at" },
                { VarCharValue: "data" },
              ],
            },
            {
              Data: [
                { VarCharValue: "activity" },
                { VarCharValue: "platform" },
                {}, // null society_id
                {}, // null target_type
                {}, // null target_id
                {}, // null thread_id
                { VarCharValue: "2026-09-03 00:00:00.000" },
                { VarCharValue: "2026-09-04 00:00:00.000" },
                {}, // null snapshot_at
                {
                  VarCharValue: JSON.stringify({
                    event_counts: {
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
                    distinct_actors: 1,
                    likes_added: 5,
                    likes_removed: 0,
                    dislikes_added: 1,
                    dislikes_removed: 0,
                    reaction_score_delta: 3,
                    joins: 0,
                    leaves: 0,
                    activations: 0,
                    bans: 0,
                    active_membership_delta: 0,
                    first_activity_at: "2026-09-03 09:24:48.340",
                    last_activity_at: "2026-09-03 09:25:12.123",
                  }),
                },
              ],
            },
            {
              Data: [
                { VarCharValue: "current_state" },
                { VarCharValue: "society" },
                { VarCharValue: "a9846cb7-e5dc-45ee-8056-2ddbb267aa4a" },
                {},
                {},
                {},
                { VarCharValue: "2026-09-03 00:00:00.000" },
                { VarCharValue: "2026-09-04 00:00:00.000" },
                { VarCharValue: "2026-09-04 00:00:00.000" },
                {
                  VarCharValue: JSON.stringify({
                    snapshot_at: "2026-09-04 00:00:00.000",
                    positive_reactions: 100,
                    negative_reactions: 16,
                    reaction_score: 84,
                    active_memberships: 88,
                  }),
                },
              ],
            },
          ],
        },
      }),
    );

    const rows = await gateway.getActionResults("query-2");
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      metricKind: "activity",
      grain: "platform",
      societyId: null,
      targetType: null,
      targetId: null,
      threadId: null,
      snapshotAt: null,
      data: {
        distinctActors: 1,
        likesAdded: 5,
        reactionScoreDelta: 3,
        firstActivityAt: "2026-09-03T09:24:48.340Z",
        lastActivityAt: "2026-09-03T09:25:12.123Z",
      },
    });

    expect(rows[1]).toMatchObject({
      metricKind: "current_state",
      grain: "society",
      societyId: "a9846cb7-e5dc-45ee-8056-2ddbb267aa4a",
      data: {
        snapshotAt: "2026-09-04T00:00:00.000Z",
        positiveReactions: 100,
        negativeReactions: 16,
        reactionScore: 84,
        activeMemberships: 88,
      },
    });
  });
});
