import {
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
} from "@aws-sdk/client-sfn";

import type { RefreshRunTrigger } from "../application/refresh-run.ports";
import type { RefreshWorkflowStarter } from "../application/refresh-workflow";

export interface StepFunctionsWorkflowStarterConfig {
  readonly region: string;
  readonly stateMachineArn: string;
}

type SendStepFunctionsCommand = (command: StartExecutionCommand | StopExecutionCommand) => Promise<unknown>;

export class StepFunctionsWorkflowStarter implements RefreshWorkflowStarter {
  private readonly stateMachineArn: string;
  private readonly send: SendStepFunctionsCommand;

  constructor(config: StepFunctionsWorkflowStarterConfig, send?: SendStepFunctionsCommand) {
    this.stateMachineArn = config.stateMachineArn;
    const client = new SFNClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command as never));
  }

  async start(input: {
    readonly runId: string;
    readonly trigger: RefreshRunTrigger;
    readonly contractVersion?: 2;
    readonly periodStart?: string;
    readonly periodEnd?: string;
    readonly snapshotAt: string;
  }): Promise<string> {
    const response = await this.send(new StartExecutionCommand({
      stateMachineArn: this.stateMachineArn,
      name: input.runId,
      input: JSON.stringify(input),
    })) as { executionArn?: string };
    if (response.executionArn === undefined) {
      throw new Error("Step Functions did not return an execution ARN");
    }
    return response.executionArn;
  }
  async stop(runId: string): Promise<void> {
    try {
      await this.send(new StopExecutionCommand({
        executionArn: this.executionArn(runId),
        cause: "Cancelled by a system administrator",
      }));
    } catch (error) {
      let name = "";
      if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
        name = error.name;
      }
      if (name !== "ExecutionDoesNotExist" && name !== "ExecutionNotRunning") throw error;
    }
  }

  private executionArn(runId: string): string {
    const executionArn = this.stateMachineArn.replace(":stateMachine:", ":execution:");
    if (executionArn === this.stateMachineArn) {
      throw new Error("Step Functions state machine ARN is invalid");
    }
    return `${executionArn}:${runId}`;
  }
}
