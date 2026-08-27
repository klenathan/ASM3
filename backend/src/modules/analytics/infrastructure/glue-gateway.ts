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

  constructor(config: GlueGatewayConfig, send?: SendGlueCommand) {
    this.config = config;
    const client = new GlueClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command as never));
  }

  async startJobRun(input: GlueJobStartInput): Promise<string> {
    const existing = await this.send(
      new GetJobRunsCommand({ JobName: this.config.jobName, MaxResults: 100 }),
    ) as { Jobs?: readonly { Id?: string; JobRunState?: string; Arguments?: Record<string, string> }[] };
    const existingRun = existing.Jobs?.find(
      (job) => job.Arguments?.["--refresh-run-id"] === input.runId &&
        job.Id !== undefined &&
        job.JobRunState !== "FAILED" &&
        job.JobRunState !== "ERROR" &&
        job.JobRunState !== "TIMEOUT" &&
        job.JobRunState !== "STOPPED",
    );
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
