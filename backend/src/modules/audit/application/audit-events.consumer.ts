import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { z } from "zod";

import type { AuditEventRepository } from "./audit-events.repository";
import {
  THREAD_CREATED_EVENT_TYPE,
  THREAD_CREATED_EVENT_VERSION,
} from "../../discussions/application/thread-events.port";

const uuidSchema = z.string().uuid();

const threadCreatedMessageSchema = z.object({
  eventId: uuidSchema,
  eventType: z.literal(THREAD_CREATED_EVENT_TYPE),
  version: z.literal(THREAD_CREATED_EVENT_VERSION),
  threadId: uuidSchema,
  societyId: uuidSchema,
  authorId: uuidSchema,
  title: z.string().min(1).max(300),
  occurredAt: z.string(),
}).strict();

export interface AuditMessage {
  readonly receiptHandle: string;
  readonly body: string;
}

export interface AuditMessageSource {
  receive(signal: AbortSignal): Promise<readonly AuditMessage[]>;
  acknowledge(receiptHandle: string): Promise<void>;
}

export interface AuditEventConsumerDependencies {
  readonly source: AuditMessageSource;
  readonly repository: AuditEventRepository;
  readonly logger: Logger;
}

export class AuditEventConsumer {
  private readonly source: AuditMessageSource;
  private readonly repository: AuditEventRepository;
  private readonly logger: Logger;
  private readonly controller = new AbortController();
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(dependencies: AuditEventConsumerDependencies) {
    this.source = dependencies.source;
    this.repository = dependencies.repository;
    this.logger = dependencies.logger;
  }

  start(): Promise<void> {
    if (this.loop !== null) return this.loop;
    this.running = true;
    this.loop = this.run();
    return this.loop;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.controller.abort();
    if (this.loop !== null) {
      await this.loop.catch(() => undefined);
      this.loop = null;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      let messages: readonly AuditMessage[];
      try {
        messages = await this.source.receive(this.controller.signal);
      } catch (error) {
        if (this.controller.signal.aborted) return;
        this.logger.error({ err: error }, "failed to receive audit messages");
        continue;
      }

      for (const message of messages) {
        const acknowledge = await this.handleMessage(message);
        if (!acknowledge) continue;
        try {
          await this.source.acknowledge(message.receiptHandle);
        } catch (error) {
          this.logger.error(
            { err: error, receiptHandle: message.receiptHandle },
            "failed to acknowledge audit message",
          );
        }
      }
    }
  }

  private async handleMessage(message: AuditMessage): Promise<boolean> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.body);
    } catch {
      this.logger.error({ body: message.body }, "received malformed audit message; leaving unacknowledged");
      return false;
    }

    const result = threadCreatedMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        { body: message.body, issues: result.error.issues },
        "received invalid audit message; leaving unacknowledged",
      );
      return false;
    }

    const event = result.data;
    try {
      const outcome = await this.repository.record({
        id: randomUUID(),
        sourceEventId: event.eventId,
        eventType: event.eventType,
        version: event.version,
        threadId: event.threadId,
        societyId: event.societyId,
        authorId: event.authorId,
        title: event.title,
        payload: { ...event },
        receivedAt: new Date(),
      });
      this.logger.info(
        {
          sourceEventId: event.eventId,
          threadId: event.threadId,
          outcome: outcome === "duplicate" ? "duplicate" : "created",
        },
        "recorded audit event",
      );
      return true;
    } catch (error) {
      // Persist failed; leave the message unacknowledged for retry/DLQ.
      this.logger.error(
        { err: error, sourceEventId: event.eventId, threadId: event.threadId },
        "failed to persist audit event",
      );
      return false;
    }
  }
}
