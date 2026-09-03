import { describe, expect, it } from "vitest";

import { AthenaGatewayAdapter } from "./athena-gateway";

const metadata = [
  "metric_kind", "grain", "society_id", "target_type", "target_id", "thread_id",
  "period_start", "period_end", "snapshot_at", "data",
];

const cells = (values: Array<string | null | undefined>) => values.map((value) => value == null ? {} : { VarCharValue: value });

describe("AthenaGatewayAdapter", () => {
  it("reads paginated action results and preserves null cells", async () => {
    let call = 0;
    const gateway = new AthenaGatewayAdapter({ region: "us-east-1" }, async () => {
      call += 1;
      if (call === 1) {
        return {
          ResultSet: {
            ResultSetMetadata: { ColumnInfo: metadata.map((Name) => ({ Name })) },
            Rows: [
              { Data: cells(metadata) },
              { Data: cells(["activity", "platform", null, null, null, null, "2026-09-03", "2026-09-04", null, '{"distinct_actors":1}']) },
            ],
          },
          NextToken: "next",
        };
      }
      return {
        ResultSet: {
          Rows: [{ Data: cells(["current_state", "platform", null, null, null, null, "2026-09-03", "2026-09-04", "2026-09-04", '{"snapshot_at":"2026-09-04","positive_reactions":3,"negative_reactions":1,"reaction_score":2,"active_memberships":4}']) }],
        },
      };
    });

    const rows = await gateway.getActionResults("query-1");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ metricKind: "activity", grain: "platform", societyId: null });
    expect(rows[1]).toMatchObject({ metricKind: "current_state", data: { positiveReactions: 3, activeMemberships: 4 } });
    expect(call).toBe(2);
  });
});
