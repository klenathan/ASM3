import type {
  AthenaGateway,
  AthenaQueryInput,
  AthenaMetricRow,
  AthenaQueryStatus,
  GlueGateway,
  GlueJobRunStatus,
} from "../application/refresh-orchestrator.ports";

/**
 * Placeholder adapters used until the real AWS SDK implementations land
 * (ticket #9 owns the @aws-sdk/client-glue / client-athena adapters that
 * implement the same ports). They complete instantly with zero output so a
 * configured environment exercises the full run lifecycle end-to-end without
 * touching data.
 */
export class PlaceholderGlueGateway implements GlueGateway {
  private readonly jobRuns = new Map<string, GlueJobRunStatus>();

  async startJobRun(input: { readonly runId: string }): Promise<string> {
    this.jobRuns.set(input.runId, "SUCCEEDED");
    return input.runId;
  }

  async getJobRunStatus(jobRunId: string): Promise<GlueJobRunStatus> {
    return this.jobRuns.get(jobRunId) ?? "SUCCEEDED";
  }
}

export class PlaceholderAthenaGateway implements AthenaGateway {
  private readonly queries = new Map<string, AthenaQueryStatus>();

  async startQuery(input: AthenaQueryInput): Promise<string> {
    const queryExecutionId = `${input.clientRequestToken}`;
    this.queries.set(queryExecutionId, "SUCCEEDED");
    return queryExecutionId;
  }

  async getStatus(queryExecutionId: string): Promise<AthenaQueryStatus> {
    return this.queries.get(queryExecutionId) ?? "SUCCEEDED";
  }

  async getResults(): Promise<readonly AthenaMetricRow[]> {
    return [];
  }
}
