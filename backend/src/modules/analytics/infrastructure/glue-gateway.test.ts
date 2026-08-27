import { describe, expect, it } from "vitest";

import { GlueGatewayAdapter } from "./glue-gateway";

describe("GlueGatewayAdapter", () => {
  it("starts the configured job and forwards the refresh id", async () => {
    const commands: unknown[] = [];
    const gateway = new GlueGatewayAdapter(
      { region: "us-east-1", jobName: "analytics-export" },
      async (command) => {
        commands.push(command);
        if (command.constructor.name === "GetJobRunsCommand") return { Jobs: [] };
        return { JobRunId: "jr-1" };
      },
    );

    await expect(
      gateway.startJobRun({
        runId: "run-1",
        arguments: {
          "--output-prefix": "analytics/source/run-1",
          "--refresh-run-id": "caller-cannot-override",
        },
      }),
    ).resolves.toBe("jr-1");

    expect((commands[1] as { input: Record<string, unknown> }).input).toMatchObject({
      JobName: "analytics-export",
      Arguments: {
        "--refresh-run-id": "run-1",
        "--output-prefix": "analytics/source/run-1",
      },
    });
  });

  it("normalizes Glue terminal states to the application port", async () => {
    const gateway = new GlueGatewayAdapter(
      { region: "us-east-1", jobName: "analytics-export" },
      async () => ({ JobRun: { JobRunState: "STOPPED" } }),
    );

    await expect(gateway.getJobRunStatus("jr-1")).resolves.toBe("CANCELLED");
  });

  it("reuses an existing non-failed run for the same refresh id", async () => {
    let startCalled = false;
    const gateway = new GlueGatewayAdapter(
      { region: "us-east-1", jobName: "analytics-export" },
      async (command) => {
        if (command.constructor.name === "GetJobRunsCommand") {
          return {
            Jobs: [{
              Id: "existing-run",
              JobRunState: "RUNNING",
              Arguments: { "--refresh-run-id": "run-1" },
            }],
          };
        }
        startCalled = true;
        return { JobRunId: "new-run" };
      },
    );

    await expect(gateway.startJobRun({ runId: "run-1" })).resolves.toBe("existing-run");
    expect(startCalled).toBe(false);
  });
});
