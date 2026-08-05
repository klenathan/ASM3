import { describe, expect, it, vi } from "vitest";
import type { SendMessageCommand } from "@aws-sdk/client-sqs";

import type { Logger } from "pino";
import type { AutoRemovedEvent } from "../../content-analysis/application/automated-removal.port";
import type { ThreadRecord } from "../../discussions/domain/discussion";
import { SqsThreadEventPublisher } from "./thread-events.sqs.publisher";

const autoRemovedEvent: AutoRemovedEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  eventType: "thread.auto_removed",
  version: 1,
  threadId: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  authorId: "33333333-3333-4333-8333-333333333333",
  analysisRunId: "44444444-4444-4444-8444-444444444444",
  reasonCode: "high_severity_high_confidence",
  threshold: 0.9,
  finding: {
    category: "harassment",
    severity: "high",
    confidence: 0.97,
    source: "body",
    sourceId: "src-1",
  },
  modelId: "model-1",
  promptVersion: "v0",
  policyVersion: "p1",
  occurredAt: "2026-01-01T00:00:00.000Z",
};

const thread: ThreadRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  authorId: "33333333-3333-4333-8333-333333333333",
  title: "Understanding SQS",
  body: "Body",
  status: "published",
  score: 0,
  commentCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
};

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 30,
  };
}

describe("SqsThreadEventPublisher", () => {
  it("builds and sends a versioned thread.created message", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "message-1" });
    const client = { send } as never;
    const logger = makeLogger() as unknown as Logger;
    const publisher = new SqsThreadEventPublisher({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/thread-events",
      logger,
      client,
    });

    await publisher.publishThreadCreated(thread);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe("https://sqs.us-east-1.amazonaws.com/123/thread-events");
    const body = JSON.parse(command.input.MessageBody ?? "{}") as Record<string, unknown>;
    expect(body.eventType).toBe("thread.created");
    expect(body.version).toBe(1);
    expect(body.threadId).toBe(thread.id);
    expect(body.societyId).toBe(thread.societyId);
    expect(body.authorId).toBe(thread.authorId);
    expect(body.title).toBe("Understanding SQS");
    expect(body).toHaveProperty("eventId");
    expect(body).toHaveProperty("occurredAt");
    expect(body).not.toHaveProperty("body");
    expect(command.input.MessageAttributes?.eventType?.StringValue).toBe("thread.created");
    expect(logger.info).toHaveBeenCalled();
  });

  it("builds and sends a versioned thread.auto_removed message", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "message-2" });
    const client = { send } as never;
    const logger = makeLogger() as unknown as Logger;
    const publisher = new SqsThreadEventPublisher({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/thread-events",
      logger,
      client,
    });

    await publisher.publishAutoRemoved(autoRemovedEvent);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe("https://sqs.us-east-1.amazonaws.com/123/thread-events");
    const body = JSON.parse(command.input.MessageBody ?? "{}") as Record<string, unknown>;
    expect(body.eventType).toBe("thread.auto_removed");
    expect(body.version).toBe(1);
    expect(body.threadId).toBe(autoRemovedEvent.threadId);
    expect(body.societyId).toBe(autoRemovedEvent.societyId);
    expect(body.authorId).toBe(autoRemovedEvent.authorId);
    expect(body.analysisRunId).toBe(autoRemovedEvent.analysisRunId);
    expect(body.eventId).toBe(autoRemovedEvent.eventId);
    expect(body.reasonCode).toBe("high_severity_high_confidence");
    expect(body.occurredAt).toBe("2026-01-01T00:00:00.000Z");
    expect(command.input.MessageAttributes?.eventType?.StringValue).toBe("thread.auto_removed");
    expect(command.input.MessageAttributes?.eventVersion?.StringValue).toBe("1");
    expect(logger.info).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: autoRemovedEvent.eventId,
        threadId: autoRemovedEvent.threadId,
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123/thread-events",
        messageId: "message-2",
      }),
      "published thread.auto_removed event",
    );
  });

  it("logs and swallows a failed auto-removed send without throwing", async () => {
    const send = vi.fn().mockRejectedValue(new Error("queue unavailable"));
    const client = { send } as never;
    const logger = makeLogger() as unknown as Logger;
    const publisher = new SqsThreadEventPublisher({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/thread-events",
      logger,
      client,
    });

    await expect(publisher.publishAutoRemoved(autoRemovedEvent)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    const calls = (logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const args = calls[0]![0] as { threadId?: string };
    expect(args.threadId).toBe(autoRemovedEvent.threadId);
  });

  it("logs and swallows a failed send without throwing", async () => {
    const send = vi.fn().mockRejectedValue(new Error("queue unavailable"));
    const client = { send } as never;
    const logger = makeLogger() as unknown as Logger;
    const publisher = new SqsThreadEventPublisher({
      region: "us-east-1",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/thread-events",
      logger,
      client,
    });

    await expect(publisher.publishThreadCreated(thread)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    const calls = (logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const args = calls[0]![0] as { threadId?: string };
    expect(args.threadId).toBe(thread.id);
  });
});
