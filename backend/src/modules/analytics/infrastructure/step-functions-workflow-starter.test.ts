import { describe, expect, it } from "vitest";

import { StepFunctionsWorkflowStarter } from "./step-functions-workflow-starter";

describe("StepFunctionsWorkflowStarter", () => {
  it("starts a named execution with the durable refresh input", async () => {
    const commands: Record<string, unknown>[] = [];
    const starter = new StepFunctionsWorkflowStarter(
      { region: "us-east-1", stateMachineArn: "state-machine-arn" },
      async (command) => {
        commands.push(command.input as unknown as Record<string, unknown>);
        return { executionArn: "execution-arn" };
      },
    );

    await expect(starter.start({
      runId: "123e4567-e89b-12d3-a456-426614174000",
      trigger: "admin",
      snapshotAt: "20260828T020000Z",
    })).resolves.toBe("execution-arn");

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      stateMachineArn: "state-machine-arn",
      name: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(JSON.parse(String(commands[0]!.input))).toEqual({
      runId: "123e4567-e89b-12d3-a456-426614174000",
      trigger: "admin",
      snapshotAt: "20260828T020000Z",
    });
  });
  it("stops the execution named by the refresh run ID", async () => {
    const commands: Record<string, unknown>[] = [];
    const starter = new StepFunctionsWorkflowStarter(
      { region: "us-east-1", stateMachineArn: "arn:aws:states:us-east-1:123:stateMachine:analytics-refresh" },
      async (command) => {
        commands.push(command.input as unknown as Record<string, unknown>);
        return {};
      },
    );

    await expect(starter.stop("123e4567-e89b-12d3-a456-426614174000")).resolves.toBeUndefined();

    expect(commands[0]).toMatchObject({
      executionArn: "arn:aws:states:us-east-1:123:execution:analytics-refresh:123e4567-e89b-12d3-a456-426614174000",
      cause: "Cancelled by a system administrator",
    });
  });
});
