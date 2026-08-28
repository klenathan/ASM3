import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const RDS_CA_BUNDLE_PATH = process.env.RDS_CA_BUNDLE_PATH ?? join(__dirname, "rds-global-bundle.pem");

interface WorkflowDatabaseOptions {
  readonly connectionString: string;
  readonly max: 1;
  readonly connectionTimeoutMillis: 5_000;
  readonly idleTimeoutMillis: 30_000;
  readonly ssl: {
    readonly rejectUnauthorized: true;
    readonly ca?: string;
  };
}

export function createWorkflowPoolOptions(databaseUrl: string): WorkflowDatabaseOptions {
  const ca = readRdsCaBundle();
  return {
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ssl: ca === undefined
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: true, ca },
  };
}

export function createWorkflowPool(databaseUrl: string): Pool {
  return new Pool(createWorkflowPoolOptions(databaseUrl));
}

function readRdsCaBundle(): string | undefined {
  try {
    return readFileSync(RDS_CA_BUNDLE_PATH, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
