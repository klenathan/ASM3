import { randomUUID } from "node:crypto";

import type { ThreadRecord } from "../domain/discussion";

export const THREAD_CREATED_EVENT_TYPE = "thread.created" as const;
export const THREAD_CREATED_EVENT_VERSION = 1 as const;

export interface ThreadCreatedEvent {
  readonly eventId: string;
  readonly eventType: typeof THREAD_CREATED_EVENT_TYPE;
  readonly version: typeof THREAD_CREATED_EVENT_VERSION;
  readonly threadId: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly title: string;
  readonly occurredAt: string;
}

export interface ThreadEventPublisher {
  publishThreadCreated(thread: ThreadRecord): Promise<void>;
}

export function buildThreadCreatedEvent(thread: ThreadRecord): ThreadCreatedEvent {
  return {
    eventId: randomUUID(),
    eventType: THREAD_CREATED_EVENT_TYPE,
    version: THREAD_CREATED_EVENT_VERSION,
    threadId: thread.id,
    societyId: thread.societyId,
    authorId: thread.authorId,
    title: thread.title,
    occurredAt: thread.createdAt.toISOString(),
  };
}

/**
 * Used when no SQS queue is configured so local development can run without
 * AWS. Publishing is intentionally a successful no-op.
 */
export class NoopThreadEventPublisher implements ThreadEventPublisher {
  async publishThreadCreated(): Promise<void> {}
}
