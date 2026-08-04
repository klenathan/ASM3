import type { SendMessageCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import { SqsReanalysisJobPublisher } from "./reanalysis.sqs";

describe("SqsReanalysisJobPublisher", () => {
  it("sends a versioned thread reanalysis job", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "message-1" });
    const publisher = new SqsReanalysisJobPublisher({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/reanalysis",
      client: { send } as never,
    });

    await publisher.enqueueReanalysis("11111111-1111-4111-8111-111111111111");

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe(
      "https://sqs.us-east-1.amazonaws.com/123/reanalysis",
    );
    const body = JSON.parse(command.input.MessageBody ?? "{}") as Record<string, unknown>;
    expect(body).toMatchObject({
      jobType: "thread.reanalysis.requested",
      version: 1,
      threadId: "11111111-1111-4111-8111-111111111111",
    });
    expect(body).toHaveProperty("jobId");
    expect(body).toHaveProperty("requestedAt");
    expect(command.input.MessageAttributes?.jobType?.StringValue).toBe(
      "thread.reanalysis.requested",
    );
  });
});
