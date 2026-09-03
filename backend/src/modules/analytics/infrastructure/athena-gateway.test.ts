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
});
