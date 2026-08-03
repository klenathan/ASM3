import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

import type {
  AuditMessage,
  AuditMessageSource,
} from "../application/audit-events.consumer";

const MAX_NUMBER_OF_MESSAGES = 10;
const LONG_POLL_SECONDS = 20;
const VISIBILITY_TIMEOUT_SECONDS = 30;

export interface SqsAuditMessageSourceOptions {
  readonly region: string;
  readonly queueUrl: string;
  readonly client?: SQSClient;
}

export class SqsAuditMessageSource implements AuditMessageSource {
  private readonly region: string;
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(options: SqsAuditMessageSourceOptions) {
    this.region = options.region;
    this.queueUrl = options.queueUrl;
    this.client = options.client ?? new SQSClient({ region: this.region });
  }

  async receive(signal: AbortSignal): Promise<readonly AuditMessage[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: MAX_NUMBER_OF_MESSAGES,
        WaitTimeSeconds: LONG_POLL_SECONDS,
        VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      }),
      { abortSignal: signal },
    );

    return (result.Messages ?? []).map((message) => ({
      receiptHandle: message.ReceiptHandle ?? "",
      body: message.Body ?? "",
    }));
  }

  async acknowledge(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
