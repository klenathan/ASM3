/**
 * Dump-RDS Lambda: Queries the RDS database for analytics data and exports
 * to Parquet files in S3. Triggered by EventBridge (nightly) or API Gateway
 * (manual refresh). Attached to VPC for RDS access.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";

export interface DumpRdsConfig {
  databaseUrl: string;
  stagingBucket: string;
  stagingPrefix: string;
  region: string;
  batchSize: number;
}

interface DumpResult {
  success: boolean;
  tables: string[];
  exportedAt: string;
  stagingPath: string;
  error?: string;
}

function loadConfig(): DumpRdsConfig {
  const required = {
    DATABASE_URL: process.env.DATABASE_URL,
    STAGING_BUCKET: process.env.STAGING_BUCKET,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing required env: ${key}`);
  }
  return {
    databaseUrl: required.DATABASE_URL!,
    stagingBucket: required.STAGING_BUCKET!,
    stagingPrefix: process.env.STAGING_PREFIX ?? "analytics/staging",
    region: process.env.AWS_REGION ?? "us-east-1",
    batchSize: Number(process.env.BATCH_SIZE ?? 10000),
  };
}

export async function handler(): Promise<DumpResult> {
  const config = loadConfig();
  const s3 = new S3Client({ region: config.region });
  const pool = new Pool({ connectionString: config.databaseUrl });
  const timestamp = new Date().toISOString().replace(/[:-]/g, "").split(".")[0]!;
  const stagingPath = `${config.stagingPrefix}/${timestamp}`;
  const tables = ["users", "threads", "comments", "memberships", "votes", "reports"];

  try {
    for (const table of tables) {
      const rows = await pool.query(`SELECT * FROM ${table}`);
      const jsonl = rows.rows.map((row) => JSON.stringify(row)).join("\n");
      await s3.send(
        new PutObjectCommand({
          Bucket: config.stagingBucket,
          Key: `${stagingPath}/${table}.jsonl`,
          Body: jsonl,
          ContentType: "application/jsonl",
        }),
      );
    }

    return {
      success: true,
      tables,
      exportedAt: new Date().toISOString(),
      stagingPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      tables,
      exportedAt: new Date().toISOString(),
      stagingPath,
      error: message,
    };
  } finally {
    await pool.end();
  }
}