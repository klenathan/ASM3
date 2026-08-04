import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

import {
  buildReanalysisJob,
  type ReanalysisJobPublisher,
  type ReanalysisMessage,
  type ReanalysisMessageSource,
} from "../application/reanalysis-queue.port";

export interface SqsReanalysisQueueOptions {
  readonly region: string;
  readonly queueUrl: string;
  readonly client?: SQSClient;
}

/** SQS transport for the reanalysis producer and the in-process worker. */
export class SqsReanalysisJobPublisher implements ReanalysisJobPublisher {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(options: SqsReanalysisQueueOptions) {
    this.queueUrl = options.queueUrl;
    this.client = options.client ?? new SQSClient({ region: options.region });
  }

  async enqueueReanalysis(threadId: string): Promise<void> {
    const job = buildReanalysisJob(threadId);
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(job),
        MessageAttributes: {
          jobType: { DataType: "String", StringValue: job.jobType },
          jobVersion: { DataType: "String", StringValue: String(job.version) },
        },
      }),
    );
  }
}

export class SqsReanalysisMessageSource implements ReanalysisMessageSource {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(options: SqsReanalysisQueueOptions) {
    this.queueUrl = options.queueUrl;
    this.client = options.client ?? new SQSClient({ region: options.region });
  }

  async receive(signal: AbortSignal): Promise<readonly ReanalysisMessage[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 120,
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
