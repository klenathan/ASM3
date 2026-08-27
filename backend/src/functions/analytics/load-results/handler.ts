/**
 * Load-Results Lambda: Triggered when EMR output lands in S3
 * (`analytics/output/`). Reads the Parquet results, maps to analytics_metrics
 * rows, upserts into RDS. Attached to VPC for RDS access.
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";

import { analyticsLogger as logger } from "../logger";

export interface LoadResultsConfig {
  databaseUrl: string;
  outputBucket: string;
  outputPrefix: string;
  region: string;
}

interface LoadResult {
  success: boolean;
  upserted: number;
  outputPath: string;
  error?: string;
}

function loadConfig(): LoadResultsConfig {
  const required = {
    DATABASE_URL: process.env.DATABASE_URL,
    OUTPUT_BUCKET: process.env.OUTPUT_BUCKET,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing required env: ${key}`);
  }
  return {
    databaseUrl: required.DATABASE_URL!,
    outputBucket: required.OUTPUT_BUCKET!,
    outputPrefix: process.env.OUTPUT_PREFIX ?? "analytics/output",
    region: process.env.AWS_REGION ?? "us-east-1",
  };
}

/** Supported metric types that come from the PySpark output. */
type MetricType = "user_growth" | "content_volume" | "top_societies" | "moderation";

interface MetricRow {
  metric_type: MetricType;
  society_id: string | null;
  period_start: string;
  period_end: string;
  data: Record<string, unknown>;
}

export async function handler(event: Record<string, unknown>): Promise<LoadResult> {
  const config = loadConfig();
  const s3 = new S3Client({ region: config.region });
  const pool = new Pool({ connectionString: config.databaseUrl });

  // If the event contains an outputPath from start-emr, use it. S3 output
  // events point at metrics.jsonl/_SUCCESS, so derive the Spark output prefix.
  const outputPath =
    outputPathFromEvent(event) ?? await findLatestOutputPath(s3, config);
  if (!outputPath) {
    logger.warn({ trigger: event.Records ? "s3" : "direct" }, "analytics output path not found");
    return { success: false, upserted: 0, outputPath: "not-found", error: "No output found in S3" };
  }
  logger.info({ outputPath, trigger: event.Records ? "s3" : "direct" }, "analytics results load started");

  try {
    // Spark writes JSON output as metrics.jsonl/part-*.json, not one object
    // named metrics.jsonl. Support both Spark output and direct JSONL files.
    const metricKeys = await findMetricObjectKeys(s3, config.outputBucket, outputPath);
    logger.info({ outputPath, metricKeys, metricFileCount: metricKeys.length }, "analytics result objects discovered");
    if (metricKeys.length === 0) {
      return { success: false, upserted: 0, outputPath, error: "Empty metrics file" };
    }

    const bodies = await Promise.all(metricKeys.map(async (key) => {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: config.outputBucket, Key: key }),
      );
      return response.Body?.transformToString() ?? "";
    }));
    const lines = bodies.flatMap((body) => body.trim().split("\n").filter(Boolean));
    const metrics: MetricRow[] = lines.map((line) => JSON.parse(line));
    logger.info({ outputPath, metricRowCount: metrics.length }, "analytics result rows parsed");

    let upserted = 0;
    for (const metric of metrics) {
      const id = crypto.randomUUID();
      const now = new Date();

      await pool.query(
        `INSERT INTO analytics_metrics (id, metric_type, society_id, period_start, period_end, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (metric_type, COALESCE(society_id, '00000000-0000-0000-0000-000000000000'), period_start)
         DO UPDATE SET data = EXCLUDED.data, period_end = EXCLUDED.period_end, updated_at = NOW()`,
        [id, metric.metric_type, metric.society_id, metric.period_start, metric.period_end, JSON.stringify(metric.data), now, now],
      );
      upserted++;
    }

    logger.info({ outputPath, upserted }, "analytics results load completed");
    return {
      success: true,
      upserted,
      outputPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, outputPath }, "analytics results load failed");
    return { success: false, upserted: 0, outputPath, error: message };
  } finally {
    await pool.end();
  }
}

export function outputPathFromEvent(event: Record<string, unknown>): string | undefined {
  if (typeof event.outputPath === "string") return event.outputPath;

  const key = s3EventObjectKey(event);
  const marker = "/metrics.jsonl/_SUCCESS";
  return key?.endsWith(marker) ? key.slice(0, -marker.length) : undefined;
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

async function findMetricObjectKeys(
  s3: S3Client,
  bucket: string,
  outputPath: string,
): Promise<string[]> {
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${outputPath}/metrics.jsonl`,
    }),
  );
  const directFile = `${outputPath}/metrics.jsonl`;
  const completionMarker = `${directFile}/_SUCCESS`;
  return (response.Contents ?? [])
    .map((object) => object.Key)
    .filter((key): key is string =>
      key !== undefined &&
      key !== completionMarker &&
      (key === directFile || key.endsWith(".json")),
    );
}

async function findLatestOutputPath(
  s3: S3Client,
  config: LoadResultsConfig,
): Promise<string | null> {
  try {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.outputBucket,
        Prefix: `${config.outputPrefix}/`,
        Delimiter: "/",
        MaxKeys: 10,
      }),
    );
    const prefixes = (response.CommonPrefixes ?? [])
      .map((p) => p.Prefix)
      .filter((p): p is string => p !== undefined)
      .sort()
      .reverse();

    return prefixes.length > 0 ? prefixes[0]!.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}