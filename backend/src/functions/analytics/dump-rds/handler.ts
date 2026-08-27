/**
 * Dump-RDS Lambda: Queries the RDS database for analytics data and exports
 * to Parquet files in S3. Triggered by EventBridge (nightly) or API Gateway
 * (manual refresh). Attached to VPC for RDS access.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";

import { analyticsLogger as logger } from "../logger";

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
  const exports = [
    {
      key: "users",
      query: `SELECT u.id, u.created_at, p.status
              FROM auth_users u
              INNER JOIN user_profiles p ON p.user_id = u.id`,
    },
    { key: "threads", query: "SELECT * FROM threads" },
    {
      key: "comments",
      query: `SELECT c.*, t.society_id
              FROM comments c
              INNER JOIN threads t ON t.id = c.thread_id`,
    },
    { key: "memberships", query: "SELECT * FROM society_memberships" },
    {
      key: "votes",
      query: `SELECT thread_id AS target_id, user_id, value, created_at FROM thread_votes
              UNION ALL
              SELECT comment_id AS target_id, user_id, value, created_at FROM comment_votes`,
    },
    { key: "reports", query: "SELECT * FROM reports" },
  ] as const;
  const tables = exports.map(({ key }) => key);
  const startedAt = Date.now();
  logger.info({ stagingPath, tableCount: tables.length }, "analytics dump started");

  try {
    for (const { key, query } of exports) {
      const rows = await pool.query(query);
      const jsonl = rows.rows.map((row) => JSON.stringify(row)).join("\n");
      await s3.send(
        new PutObjectCommand({
          Bucket: config.stagingBucket,
          Key: `${stagingPath}/${key}.jsonl`,
          Body: jsonl,
          ContentType: "application/jsonl",
        }),
      );
      logger.info({ key, rowCount: rows.rowCount, byteCount: Buffer.byteLength(jsonl) }, "analytics table exported");
    }

    // Signals that all table exports are present. S3 invokes start-emr from this marker.
    await s3.send(
      new PutObjectCommand({
        Bucket: config.stagingBucket,
        Key: `${stagingPath}/_SUCCESS`,
        Body: "",
        ContentType: "text/plain",
      }),
    );
    logger.info({ stagingPath, durationMs: Date.now() - startedAt }, "analytics dump completed; completion marker written");

    return {
      success: true,
      tables,
      exportedAt: new Date().toISOString(),
      stagingPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, stagingPath, durationMs: Date.now() - startedAt }, "analytics dump failed");
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