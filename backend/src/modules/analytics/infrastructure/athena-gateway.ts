import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";

import type {
  AthenaGateway,
  AthenaMetricRow,
  AthenaQueryInput,
  AthenaQueryStatus,
} from "../application/refresh-orchestrator.ports";
import { parseAthenaResultRows, type AthenaResultRow } from "./athena-result-parser";

export interface AthenaGatewayConfig {
  readonly region: string;
  readonly database: string;
  readonly catalog?: string | undefined;
  readonly workGroup?: string | undefined;
  readonly outputLocation?: string | undefined;
}

type AthenaCommand =
  | StartQueryExecutionCommand
  | GetQueryExecutionCommand
  | GetQueryResultsCommand;
type SendAthenaCommand = (command: AthenaCommand) => Promise<unknown>;

const STATUS_VALUES = new Set<AthenaQueryStatus>([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export class AthenaGatewayAdapter implements AthenaGateway {
  private readonly config: AthenaGatewayConfig;
  private readonly send: SendAthenaCommand;

  constructor(config: AthenaGatewayConfig, send?: SendAthenaCommand) {
    this.config = config;
    const client = new AthenaClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command as never));
  }

  async startQuery(input: AthenaQueryInput): Promise<string> {
    const resultConfiguration = input.outputLocation === undefined && this.config.outputLocation === undefined
      ? undefined
      : { OutputLocation: input.outputLocation ?? this.config.outputLocation };
    const response = await this.send(
      new StartQueryExecutionCommand({
        QueryString: input.sql,
        ClientRequestToken: input.clientRequestToken,
        QueryExecutionContext: {
          Catalog: this.config.catalog,
          Database: this.config.database,
        },
        ...(resultConfiguration === undefined ? {} : { ResultConfiguration: resultConfiguration }),
        ...(this.config.workGroup === undefined ? {} : { WorkGroup: this.config.workGroup }),
      }),
    ) as { QueryExecutionId?: string };
    if (response.QueryExecutionId === undefined) throw new Error("Athena did not return a query execution id");
    return response.QueryExecutionId;
  }

  async getStatus(queryExecutionId: string): Promise<AthenaQueryStatus> {
    const response = await this.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }),
    ) as { QueryExecution?: { Status?: { State?: string } } };
    const state = response.QueryExecution?.Status?.State;
    if (state === undefined || !STATUS_VALUES.has(state as AthenaQueryStatus)) {
      throw new Error(`Athena returned unsupported query state: ${state ?? "missing"}`);
    }
    return state as AthenaQueryStatus;
  }

  async getResults(queryExecutionId: string): Promise<readonly AthenaMetricRow[]> {
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

      const pageColumns = response.ResultSet?.ResultSetMetadata?.ColumnInfo
        ?.map((column) => column.Name);
      if (columnNames === undefined && pageColumns !== undefined && pageColumns.every((name): name is string => name !== undefined)) {
        columnNames = pageColumns;
      }
      for (const row of response.ResultSet?.Rows ?? []) {
        rows.push((row.Data ?? []).map((cell) => cell.VarCharValue));
      }
      nextToken = response.NextToken;
    } while (nextToken !== undefined);

    if (columnNames === undefined) throw new Error("Athena returned no result column metadata");
    return parseAthenaResultRows(columnNames, rows);
  }
}
