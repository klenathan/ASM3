import {
  AthenaClient,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";

import type {
  AthenaActionMetricRow,
  AthenaGateway,
} from "../application/refresh-run.ports";
import {
  parseActionAthenaResultRows,
  type AthenaResultRow,
} from "./athena-result-parser";

export interface AthenaGatewayConfig {
  readonly region: string;
}

type SendAthenaCommand = (command: GetQueryResultsCommand) => Promise<unknown>;

export class AthenaGatewayAdapter implements AthenaGateway {
  private readonly send: SendAthenaCommand;

  constructor(config: AthenaGatewayConfig, send?: SendAthenaCommand) {
    const client = new AthenaClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command as never));
  }


  async getActionResults(queryExecutionId: string): Promise<readonly AthenaActionMetricRow[]> {
    const { columnNames, rows } = await this.readRows(queryExecutionId);
    return parseActionAthenaResultRows(columnNames, rows);
  }

  private async readRows(queryExecutionId: string): Promise<{
    readonly columnNames: string[];
    readonly rows: readonly AthenaResultRow[];
  }> {
    const rows: AthenaResultRow[] = [];
    let columnNames: string[] | undefined;
    let nextToken: string | undefined;
    do {
      const response = await this.send(
        new GetQueryResultsCommand({
          QueryExecutionId: queryExecutionId,
          ...(nextToken === undefined ? {} : { NextToken: nextToken }),
        }),
      ) as {
        ResultSet?: {
          ResultSetMetadata?: { ColumnInfo?: readonly { Name?: string }[] };
          Rows?: readonly { Data?: readonly { VarCharValue?: string }[] }[];
        };
        NextToken?: string;
      };
      const pageColumns = response.ResultSet?.ResultSetMetadata?.ColumnInfo?.map((column) => column.Name);
      if (columnNames === undefined && pageColumns !== undefined && pageColumns.every((name): name is string => name !== undefined)) {
        columnNames = pageColumns;
      }
      for (const row of response.ResultSet?.Rows ?? []) rows.push((row.Data ?? []).map((cell) => cell.VarCharValue));
      nextToken = response.NextToken;
    } while (nextToken !== undefined);
    if (columnNames === undefined) throw new Error("Athena returned no result column metadata");
    return { columnNames, rows };
  }
}
