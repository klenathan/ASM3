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
