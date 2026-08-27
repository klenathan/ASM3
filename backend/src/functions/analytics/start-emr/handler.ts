/**
 * Start-Serverless Lambda: Triggered after dump completes (S3 put event on
 * analytics/staging/_SUCCESS). Starts an EMR Serverless Spark job via
 * StartJobRunCommand, polling GetJobRun every 30s with 900s timeout and
 * CancelJobRun on timeout.
 *
 * Replaces classic EMR RunJobFlow / DescribeCluster / TerminateJobFlows.
 */
import {
  EMRServerlessClient,
  StartJobRunCommand,
  GetJobRunCommand,
  CancelJobRunCommand,
} from "@aws-sdk/client-emr-serverless";

import { analyticsLogger as logger } from "../logger";

export interface StartServerlessConfig {
  region: string;
  applicationId: string;
  executionRoleArn: string;
  stagingBucket: string;
  stagingPrefix: string;
  outputBucket: string;
  outputPrefix: string;
  scriptBucket: string;
  scriptKey: string;
  logBucket: string;
  logPrefix: string;
  jobPollIntervalMs: number;
  jobTimeoutMs: number;
}

/** Kept as alias for backward compat with tests importing StartEmrConfig */
export type StartEmrConfig = StartServerlessConfig;

interface ServerlessResult {
  success: boolean;
  applicationId: string | null;
  jobRunId: string | null;
  clusterId: string | null;
  stepId: string | null;
  message: string;
  startedAt: string;
  completedAt: string | null;
}

function loadConfig(): StartServerlessConfig {
  const required = {
    REGION: process.env.AWS_REGION ?? "us-east-1",
    APPLICATION_ID: process.env.APPLICATION_ID,
    EXECUTION_ROLE_ARN: process.env.EXECUTION_ROLE_ARN,
    STAGING_BUCKET: process.env.STAGING_BUCKET,
    OUTPUT_BUCKET: process.env.OUTPUT_BUCKET,
    SCRIPT_BUCKET: process.env.SCRIPT_BUCKET,
    SCRIPT_KEY: process.env.SCRIPT_KEY,
    LOG_BUCKET: process.env.LOG_BUCKET,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`missing required env: ${missing.join(", ")}`);
  }

  return {
    region: required.REGION!,
    applicationId: required.APPLICATION_ID!,
    executionRoleArn: required.EXECUTION_ROLE_ARN!,
    stagingBucket: required.STAGING_BUCKET!,
    stagingPrefix: process.env.STAGING_PREFIX ?? "analytics/staging",
    outputBucket: required.OUTPUT_BUCKET!,
    outputPrefix: process.env.OUTPUT_PREFIX ?? "analytics/output",
    scriptBucket: required.SCRIPT_BUCKET!,
    scriptKey: required.SCRIPT_KEY!,
    logBucket: required.LOG_BUCKET!,
    logPrefix: process.env.LOG_PREFIX ?? "analytics/emr-serverless-logs",
    jobPollIntervalMs: Number(
      process.env.JOB_POLL_INTERVAL_MS ??
        process.env.CLUSTER_POLL_INTERVAL_MS ??
        30_000,
    ),
    jobTimeoutMs: Number(
      process.env.JOB_TIMEOUT_MS ??
        process.env.CLUSTER_TIMEOUT_MS ??
        900_000,
    ),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stagingPathFromEvent(event: Record<string, unknown>): string | undefined {
  if (typeof event.stagingPath === "string") return event.stagingPath;

  const key = s3EventObjectKey(event);
  return key?.endsWith("/_SUCCESS") ? key.slice(0, -"/_SUCCESS".length) : undefined;
}

function s3EventObjectKey(event: Record<string, unknown>): string | undefined {
  const records = event.Records;
  if (!Array.isArray(records) || records.length === 0) return undefined;

  const record = records[0];
  if (record === null || typeof record !== "object") return undefined;
  const s3 = (record as { s3?: unknown }).s3;
  if (s3 === null || typeof s3 !== "object") return undefined;
  const object = (s3 as { object?: unknown }).object;
  if (object === null || typeof object !== "object") return undefined;
  const encodedKey = (object as { key?: unknown }).key;
  if (typeof encodedKey !== "string") return undefined;

  try {
    return decodeURIComponent(encodedKey.replace(/\+/g, " "));
  } catch {
    return encodedKey;
  }
}

export async function handler(event: Record<string, unknown>): Promise<ServerlessResult> {
  const config = loadConfig();
  const emrServerless = new EMRServerlessClient({ region: config.region });
  const startedAt = new Date().toISOString();

  let jobRunId: string | null = null;

  try {
    // 1. Find the latest staging path and output path
    const stagingPath =
      stagingPathFromEvent(event) ??
      `${config.stagingPrefix}/${new Date().toISOString().replace(/[:-]/g, "").split(".")[0]!}`;
    const outputPath = `${config.outputPrefix}/${new Date().toISOString().replace(/[:-]/g, "").split(".")[0]!}`;
    logger.info({ stagingPath, outputPath, trigger: event.Records ? "s3" : "direct" }, "analytics Serverless start requested");

    // 2. Start EMR Serverless job
    const startResponse = await emrServerless.send(
      new StartJobRunCommand({
        applicationId: config.applicationId,
        executionRoleArn: config.executionRoleArn,
        jobDriver: {
          sparkSubmit: {
            entryPoint: `s3://${config.scriptBucket}/${config.scriptKey}`,
            entryPointArguments: [
              "--staging-bucket",
              config.stagingBucket,
              "--staging-path",
              stagingPath,
              "--output-bucket",
              config.outputBucket,
              "--output-path",
              outputPath,
            ],
            sparkSubmitParameters:
              "--conf spark.driver.cores=1 --conf spark.driver.memory=3g --conf spark.executor.cores=2 --conf spark.executor.memory=4g --conf spark.executor.instances=1",
          },
        },
        configurationOverrides: {
          monitoringConfiguration: {
            s3MonitoringConfiguration: {
              logUri: `s3://${config.logBucket}/${config.logPrefix}`,
            },
          },
        },
      }),
    );

    jobRunId = startResponse.jobRunId ?? null;
    if (!jobRunId) throw new Error("EMR Serverless StartJobRun returned no jobRunId");
    logger.info({ applicationId: config.applicationId, jobRunId, stagingPath, outputPath }, "analytics Serverless job started");

    // 3. Poll GetJobRun every 30s with 900s timeout; CancelJobRun on timeout
    const deadline = Date.now() + config.jobTimeoutMs;
    let jobState = "";
    let previousJobState = "";

    do {
      await sleep(config.jobPollIntervalMs);

      if (Date.now() > deadline) {
        logger.error({ applicationId: config.applicationId, jobRunId, timeoutMs: config.jobTimeoutMs }, "analytics Serverless job timed out");
        try {
          await emrServerless.send(
            new CancelJobRunCommand({
              applicationId: config.applicationId,
              jobRunId,
            }),
          );
        } catch (cancelError) {
          logger.warn({ err: cancelError, jobRunId }, "analytics Serverless cancel failed");
        }
        return {
          success: false,
          applicationId: config.applicationId,
          jobRunId,
          clusterId: jobRunId,
          stepId: null,
          message: "EMR Serverless job timed out and was cancelled",
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      const describeResponse = await emrServerless.send(
        new GetJobRunCommand({
          applicationId: config.applicationId,
          jobRunId,
        }),
      );
      jobState = describeResponse.jobRun?.state ?? "UNKNOWN";
      if (jobState !== previousJobState) {
        logger.info({ applicationId: config.applicationId, jobRunId, jobState }, "analytics Serverless job state changed");
        previousJobState = jobState;
      }

      if (jobState === "SUCCESS") {
        logger.info({ applicationId: config.applicationId, jobRunId, jobState, outputPath }, "analytics Serverless job completed");
        return {
          success: true,
          applicationId: config.applicationId,
          jobRunId,
          clusterId: jobRunId,
          stepId: null,
          message: `EMR Serverless job ${jobRunId} succeeded`,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (jobState === "FAILED" || jobState === "CANCELLED") {
        const stateDetails = describeResponse.jobRun?.stateDetails ?? jobState;
        logger.error({ applicationId: config.applicationId, jobRunId, jobState, stateDetails }, "analytics Serverless job failed");
        return {
          success: false,
          applicationId: config.applicationId,
          jobRunId,
          clusterId: jobRunId,
          stepId: null,
          message: `EMR Serverless job ${jobRunId} ${jobState}: ${stateDetails}`,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
      // eslint-disable-next-line no-constant-condition
    } while (true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, jobRunId }, "analytics Serverless start failed");
    return {
      success: false,
      applicationId: null,
      jobRunId,
      clusterId: jobRunId,
      stepId: null,
      message,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
