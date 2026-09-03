import {
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

import type { RefreshRunTrigger } from "../application/refresh-run.ports";
import type { RefreshWorkflowStarter } from "../application/refresh-workflow";

export interface StepFunctionsWorkflowStarterConfig {
  readonly region: string;
  readonly stateMachineArn: string;
}

type SendStepFunctionsCommand = (command: StartExecutionCommand) => Promise<unknown>;

export class StepFunctionsWorkflowStarter implements RefreshWorkflowStarter {
  private readonly stateMachineArn: string;
  private readonly send: SendStepFunctionsCommand;

  constructor(config: StepFunctionsWorkflowStarterConfig, send?: SendStepFunctionsCommand) {
    this.stateMachineArn = config.stateMachineArn;
    const client = new SFNClient({ region: config.region });
    this.send = send ?? ((command) => client.send(command));
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
}
