import { describe, expect, it } from "vitest";

import { AthenaGatewayAdapter } from "./athena-gateway";

describe("AthenaGatewayAdapter", () => {
  it("starts queries with the configured catalog and idempotency token", async () => {
    const commands: unknown[] = [];
    const gateway = new AthenaGatewayAdapter(
      {
        region: "us-east-1",
        database: "analytics",
        catalog: "AwsDataCatalog",
        workGroup: "analytics",
      },
      async (command) => {
        commands.push(command);
        return { QueryExecutionId: "query-1" };
      },
    );

    await expect(
      gateway.startQuery({
        sql: "SELECT 1",
        clientRequestToken: "run-1:user_growth",
        outputLocation: "s3://results/queries/",
      }),
    ).resolves.toBe("query-1");

    expect((commands[0] as { input: Record<string, unknown> }).input).toMatchObject({
      QueryString: "SELECT 1",
      ClientRequestToken: "run-1:user_growth",
      QueryExecutionContext: { Catalog: "AwsDataCatalog", Database: "analytics" },
      ResultConfiguration: { OutputLocation: "s3://results/queries/" },
      WorkGroup: "analytics",
    });
  });

  it("reads all paginated result rows", async () => {
    let call = 0;
    const gateway = new AthenaGatewayAdapter(
      { region: "us-east-1", database: "analytics" },
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
