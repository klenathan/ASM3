import {
  GetJobRunCommand,
  GetJobRunsCommand,
  GlueClient,
  StartJobRunCommand,
} from "@aws-sdk/client-glue";

import type {
  GlueGateway,
  GlueJobRunStatus,
  GlueJobStartInput,
} from "../application/refresh-orchestrator.ports";

export interface GlueGatewayConfig {
  readonly region: string;
  readonly jobName: string;
}

type GlueCommand = StartJobRunCommand | GetJobRunCommand | GetJobRunsCommand;
type SendGlueCommand = (command: GlueCommand) => Promise<unknown>;

const STATUS_MAP: Readonly<Record<string, GlueJobRunStatus>> = {
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  STOPPING: "STOPPING",
  STOPPED: "CANCELLED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  TIMEOUT: "TIMEOUT",
  ERROR: "ERROR",
  WAITING: "STARTING",
};

export class GlueGatewayAdapter implements GlueGateway {
  private readonly config: GlueGatewayConfig;
  private readonly send: SendGlueCommand;
  private readonly startLocks = new Map<string, Promise<string>>();

  constructor(config: GlueGatewayConfig, send?: SendGlueCommand) {
    this.config = config;
    const client = new GlueClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command as never));
  }

  async startJobRun(input: GlueJobStartInput): Promise<string> {
    const inFlight = this.startLocks.get(input.runId);
    if (inFlight !== undefined) return inFlight;

    const start = this.startJobRunOnce(input);
    this.startLocks.set(input.runId, start);
    try {
      return await start;
    } finally {
      if (this.startLocks.get(input.runId) === start) this.startLocks.delete(input.runId);
    }
  }

  private async startJobRunOnce(input: GlueJobStartInput): Promise<string> {
    // Glue StartJobRun has no client idempotency token. The lookup closes the
    // restart gap and startLocks close concurrent calls in this ECS process;
    // two independent processes can still race at the AWS API boundary.
    const existingRun = await this.findExistingRun(input.runId);
    if (existingRun?.Id !== undefined) return existingRun.Id;

    const response = await this.send(
      new StartJobRunCommand({
        JobName: this.config.jobName,
        Arguments: {
          ...input.arguments,
          "--refresh-run-id": input.runId,
        },
      }),
    ) as { JobRunId?: string };
    if (response.JobRunId === undefined) throw new Error("Glue did not return a job run id");
    return response.JobRunId;
  }

  private async findExistingRun(runId: string): Promise<{ Id?: string } | undefined> {
    let nextToken: string | undefined;
    do {
      const response = await this.send(
        new GetJobRunsCommand({
          JobName: this.config.jobName,
          MaxResults: 100,
          ...(nextToken === undefined ? {} : { NextToken: nextToken }),
        }),
      ) as {
        Jobs?: readonly { Id?: string; JobRunState?: string; Arguments?: Record<string, string> }[];
        NextToken?: string;
      };
      const existingRun = response.Jobs?.find(
        (job) => job.Arguments?.["--refresh-run-id"] === runId &&
          job.Id !== undefined &&
          job.JobRunState !== undefined &&
          job.JobRunState !== "FAILED" &&
          job.JobRunState !== "ERROR" &&
          job.JobRunState !== "TIMEOUT" &&
          job.JobRunState !== "STOPPED",
      );
      if (existingRun !== undefined) return existingRun;
      nextToken = response.NextToken;
    } while (nextToken !== undefined);
    return undefined;
  }

  async getJobRunStatus(jobRunId: string): Promise<GlueJobRunStatus> {
    const response = await this.send(
      new GetJobRunCommand({ JobName: this.config.jobName, RunId: jobRunId }),
    ) as { JobRun?: { JobRunState?: string } };
    const state = response.JobRun?.JobRunState;
    const status = state === undefined ? undefined : STATUS_MAP[state];
    if (status === undefined) throw new Error(`Glue returned unsupported job state: ${state ?? "missing"}`);
    return status;
  }
}
