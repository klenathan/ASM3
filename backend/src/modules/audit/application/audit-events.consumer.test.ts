import { describe, expect, it, vi } from "vitest";
import { type Logger } from "pino";

import type { AuditEventRepository } from "./audit-events.repository";
import {
  AuditEventConsumer,
  type AuditMessage,
  type AuditMessageSource,
} from "./audit-events.consumer";

const validMessageBody = JSON.stringify({
  eventId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  eventType: "thread.created",
  version: 1,
  threadId: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  authorId: "33333333-3333-4333-8333-333333333333",
  title: "Hello",
  occurredAt: "2026-01-01T00:00:00.000Z",
});

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

/**
 * Source that returns a single fixed batch on the first receive call, then
 * blocks until the consumer is stopped.
 */
function batchSource(batch: AuditMessage[]) {
  let exhausted = false;
  const acknowledged: string[] = [];
  const source: AuditMessageSource = {
    receive: (signal: AbortSignal) => {
      if (!exhausted) {
        exhausted = true;
        return Promise.resolve(batch);
      }
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve([]));
      });
    },
    acknowledge: async (receiptHandle) => {
      acknowledged.push(receiptHandle);
    },
  };
  return { source, acknowledged };
}

function makeRepository(): AuditEventRepository {
  return {
    record: vi.fn(async () => "created"),
  } as unknown as AuditEventRepository;
}

function blockingSource(aborted: boolean[] = []) {
  const source: AuditMessageSource = {
    receive: (signal: AbortSignal) => new Promise<readonly AuditMessage[]>((resolve) => {
      signal.addEventListener("abort", () => {
        aborted.push(signal.aborted);
        resolve([]);
      });
    }),
    acknowledge: async () => undefined,
  };
  return { source, aborted };
}

describe("AuditEventConsumer", () => {
  it("acknowledges a message only after the audit event is persisted", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "handle-1", body: validMessageBody },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await vi.waitFor(() => {
      expect(repository.record).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(acknowledged).toContain("handle-1");
    });

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("treats a duplicate source event id as success and acknowledges", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "handle-dup", body: validMessageBody },
    ]);
    const repository = {
      record: vi.fn(async () => "duplicate"),
    } as unknown as AuditEventRepository;
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await vi.waitFor(() => {
      expect(acknowledged).toContain("handle-dup");
    });

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("does not acknowledge a malformed message", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "bad", body: "not-json" },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(repository.record).not.toHaveBeenCalled();
    expect(acknowledged).not.toContain("bad");

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("does not acknowledge when persistence fails", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "fail", body: validMessageBody },
    ]);
    const repository = {
      record: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    } as unknown as AuditEventRepository;
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(acknowledged).not.toContain("fail");

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // thread.auto_removed (ATR-010)
  // -------------------------------------------------------------------------

  const validAutoRemovedBody = JSON.stringify({
    eventId: "99999999-9999-4999-8999-999999999999",
    eventType: "thread.auto_removed",
    version: 1,
    threadId: "11111111-1111-4111-8111-111111111111",
    societyId: "22222222-2222-4222-8222-222222222222",
    authorId: "33333333-3333-4333-8333-333333333333",
    analysisRunId: "99999999-9999-4999-8999-999999999999",
    reasonCode: "high_severity_high_confidence",
    threshold: 0.9,
    finding: {
      category: "harassment",
      severity: "high",
      confidence: 0.97,
      source: "body",
      sourceId: "src-1",
    },
    modelId: "deepseek/test",
    promptVersion: "prompt-1",
    policyVersion: "v2",
    occurredAt: "2026-01-01T00:00:00.000Z",
  });

  it("records and acknowledges a valid thread.auto_removed message", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "auto-1", body: validAutoRemovedBody },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await vi.waitFor(() => {
      expect(repository.record).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(repository.record).mock.calls[0]?.[0];
    expect(input?.eventType).toBe("thread.auto_removed");
    expect(input?.sourceEventId).toBe("99999999-9999-4999-8999-999999999999");
    expect(input?.title).toBeNull();

    await vi.waitFor(() => {
      expect(acknowledged).toContain("auto-1");
    });

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("treats a duplicate thread.auto_removed source id as success and acknowledges", async () => {
    const { source, acknowledged } = batchSource([
      { receiptHandle: "auto-dup", body: validAutoRemovedBody },
    ]);
    const repository = {
      record: vi.fn(async () => "duplicate"),
    } as unknown as AuditEventRepository;
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await vi.waitFor(() => {
      expect(acknowledged).toContain("auto-dup");
    });

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("does not acknowledge an invalid thread.auto_removed message (unknown reason code)", async () => {
    const { source, acknowledged } = batchSource([
      {
        receiptHandle: "auto-bad",
        body: JSON.stringify({ ...JSON.parse(validAutoRemovedBody), reasonCode: "bogus" }),
      },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(repository.record).not.toHaveBeenCalled();
    expect(acknowledged).not.toContain("auto-bad");

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("does not acknowledge a thread.auto_removed message with confidence below threshold", async () => {
    const { source, acknowledged } = batchSource([
      {
        receiptHandle: "auto-low",
        body: JSON.stringify(
          { ...JSON.parse(validAutoRemovedBody), finding: { ...JSON.parse(validAutoRemovedBody).finding, confidence: 0.5 } },
        ),
      },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(repository.record).not.toHaveBeenCalled();
    expect(acknowledged).not.toContain("auto-low");

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("does not acknowledge an unknown event type", async () => {
    const { source, acknowledged } = batchSource([
      {
        receiptHandle: "auto-unknown-type",
        body: JSON.stringify({ ...JSON.parse(validAutoRemovedBody), eventType: "thread.bogus" }),
      },
    ]);
    const repository = makeRepository();
    const consumer = new AuditEventConsumer({
      source,
      repository,
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(repository.record).not.toHaveBeenCalled();
    expect(acknowledged).not.toContain("auto-unknown-type");

    await consumer.stop();
    await expect(loop).resolves.toBeUndefined();
  });

  it("stops polling when stop is called", async () => {
    const { source, aborted } = blockingSource();
    const consumer = new AuditEventConsumer({
      source,
      repository: makeRepository(),
      logger: makeLogger() as unknown as Logger,
    });
    const loop = consumer.start();

    await consumer.stop();

    await expect(loop).resolves.toBeUndefined();
    expect(aborted.length).toBeGreaterThan(0);
    expect(aborted[0]).toBe(true);
  });
});
