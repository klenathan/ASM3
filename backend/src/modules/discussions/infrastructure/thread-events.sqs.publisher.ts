import {
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { Logger } from "pino";

import type { ThreadRecord } from "../domain/discussion";
import {
  buildThreadCreatedEvent,
  THREAD_CREATED_EVENT_TYPE,
  THREAD_CREATED_EVENT_VERSION,
  type ThreadEventPublisher,
} from "../application/thread-events.port";
import {
  AUTO_REMOVED_EVENT_TYPE,
  AUTO_REMOVED_EVENT_VERSION,
  type AutoRemovedEvent,
} from "../../content-analysis/application/automated-removal.port";

export interface SqsThreadEventPublisherOptions {
  readonly region: string;
  readonly queueUrl: string;
  readonly logger: Logger;
  readonly client?: SQSClient;
}

export class SqsThreadEventPublisher implements ThreadEventPublisher {
  private readonly region: string;
  private readonly queueUrl: string;
  private readonly logger: Logger;
  private readonly client: SQSClient;

  constructor(options: SqsThreadEventPublisherOptions) {
    this.region = options.region;
    this.queueUrl = options.queueUrl;
    this.logger = options.logger;
    this.client = options.client ?? new SQSClient({ region: this.region });
  }

  async publishThreadCreated(thread: ThreadRecord): Promise<void> {
    const event = buildThreadCreatedEvent(thread);
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(event),
      MessageAttributes: {
        eventType: { DataType: "String", StringValue: THREAD_CREATED_EVENT_TYPE },
        eventVersion: { DataType: "String", StringValue: String(THREAD_CREATED_EVENT_VERSION) },
      },
    });

    try {
      const result = await this.client.send(command);
      this.logger.info(
        {
          eventId: event.eventId,
          threadId: event.threadId,
          societyId: event.societyId,
          queueUrl: this.queueUrl,
          messageId: result.MessageId,
        },
        "published thread.created event",
      );
    } catch (error) {
      // A failed send must not fail an already-committed thread creation.
      this.logger.error(
        {
          err: error,
          eventId: event.eventId,
          threadId: event.threadId,
          queueUrl: this.queueUrl,
        },
        "failed to publish thread.created event",
      );
    }
  }

  async publishAutoRemoved(event: AutoRemovedEvent): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(event),
      MessageAttributes: {
        eventType: { DataType: "String", StringValue: AUTO_REMOVED_EVENT_TYPE },
        eventVersion: { DataType: "String", StringValue: String(AUTO_REMOVED_EVENT_VERSION) },
      },
    });

    try {
      const result = await this.client.send(command);
      this.logger.info(
        {
          eventId: event.eventId,
          threadId: event.threadId,
          queueUrl: this.queueUrl,
          messageId: result.MessageId,
        },
        "published thread.auto_removed event",
      );
    } catch (error) {
      // A failed send must not fail an already-committed automatic removal.
      this.logger.error(
        {
          err: error,
          eventId: event.eventId,
          threadId: event.threadId,
          queueUrl: this.queueUrl,
        },
        "failed to publish thread.auto_removed event",
      );
    }
  }
}
