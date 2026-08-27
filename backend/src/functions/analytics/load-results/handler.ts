/**
 * Load-Results Lambda: Triggered when EMR output lands in S3
 * (`analytics/output/`). Reads the Parquet results, maps to analytics_metrics
 * rows, upserts into RDS. Attached to VPC for RDS access.
 */
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";

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

  // If the event contains an outputPath from start-emr, use it.
  // Otherwise, scan the latest output prefix.
  const outputPath = (event.outputPath as string) ?? await findLatestOutputPath(s3, config);
  if (!outputPath) {
    return { success: false, upserted: 0, outputPath: "not-found", error: "No output found in S3" };
  }

  try {
    // Read the metrics JSONL from S3
    const getObjectResponse = await s3.send(
      new GetObjectCommand({
        Bucket: config.outputBucket,
        Key: `${outputPath}/metrics.jsonl`,
      }),
    );

    const body = await getObjectResponse.Body?.transformToString();
    if (!body) {
      return { success: false, upserted: 0, outputPath, error: "Empty metrics file" };
    }

    const lines = body.trim().split("\n").filter(Boolean);
    const metrics: MetricRow[] = lines.map((line) => JSON.parse(line));

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

    return {
      success: true,
      upserted,
      outputPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, upserted: 0, outputPath, error: message };
  } finally {
    await pool.end();
  }
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