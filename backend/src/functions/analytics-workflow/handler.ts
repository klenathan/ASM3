import { randomUUID } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { AthenaGatewayAdapter } from "../../modules/analytics/infrastructure/athena-gateway";
import { DrizzleAnalyticsRepository } from "../../modules/analytics/infrastructure/drizzle-analytics.repository";
import { DrizzleRefreshRunStore } from "../../modules/analytics/infrastructure/drizzle-refresh-run.store";
import type {
  AthenaMetricRow,
  RefreshRunStatus,
} from "../../modules/analytics/application/refresh-run.ports";
import { createAthenaMetricSqlCatalog } from "../../modules/analytics/infrastructure/athena-sql-catalog";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
interface WorkflowEvent {
  readonly action: "mark" | "prepare" | "persist";
  readonly runId: string;
  readonly status?: RefreshRunStatus;
  readonly lastError?: string;
  readonly glueJobRunId?: string;
  readonly queryExecutionIds?: readonly {
    readonly metricType: string;
    readonly queryExecutionId: string;
  }[];
}

const secrets = new SecretsManagerClient({});
let databaseUrl: string | undefined;
let pool: Pool | undefined;
let runStore: DrizzleRefreshRunStore | undefined;
let repository: DrizzleAnalyticsRepository | undefined;
let athena: AthenaGatewayAdapter | undefined;

export async function handler(event: WorkflowEvent): Promise<{
  readonly runId: string;
  readonly status: RefreshRunStatus;
  readonly queries?: readonly { readonly metricType: string; readonly sql: string }[];
}> {
  const dependencies = await getDependencies();
  const run = await dependencies.runStore.get(event.runId);
  if (run === null) throw new Error(`analytics refresh run ${event.runId} was not found`);
  if (event.action === "prepare") {
    const saved = await dependencies.runStore.save({
      ...run,
      status: "querying",
      glueJobRunId: event.glueJobRunId ?? run.glueJobRunId,
      updatedAt: new Date(),
    });
    const catalog = createAthenaMetricSqlCatalog(saved.runId);
    return {
      runId: saved.runId,
      status: saved.status,
      queries: Object.entries(catalog).map(([metricType, sql]) => ({ metricType, sql })),
    };
  }
  if (event.action === "mark") {
    if (event.status === undefined) throw new Error("workflow mark event is missing status");
    const saved = await dependencies.runStore.save({
      ...run,
      status: event.status,
      glueJobRunId: event.glueJobRunId ?? run.glueJobRunId,
      athenaQueryExecutionIds: mergeQueryIds(run.athenaQueryExecutionIds, event.queryExecutionIds),
      lastError: event.lastError ?? run.lastError,
      updatedAt: new Date(),
    });
    return { runId: saved.runId, status: saved.status };
  }

  const queryIds = event.queryExecutionIds ?? [];
  if (queryIds.length === 0) throw new Error("workflow persist event is missing Athena query IDs");
  const rows: AthenaMetricRow[] = [];
  for (const query of queryIds) {
    rows.push(...await dependencies.athena.getResults(query.queryExecutionId));
  }
  await dependencies.repository.upsertMetrics(rows.map((row) => ({
    id: randomUUID(),
    metricType: row.metricType,
    societyId: row.societyId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    data: row.data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })));

  const saved = await dependencies.runStore.save({
    ...run,
    status: "completed",
    athenaQueryExecutionIds: mergeQueryIds(run.athenaQueryExecutionIds, queryIds),
    lastError: null,
    updatedAt: new Date(),
  });
  return { runId: saved.runId, status: saved.status };
}

async function getDependencies(): Promise<{
  readonly runStore: DrizzleRefreshRunStore;
  readonly repository: DrizzleAnalyticsRepository;
  readonly athena: AthenaGatewayAdapter;
}> {
  if (pool !== undefined && runStore !== undefined && repository !== undefined && athena !== undefined) {
    return { runStore, repository, athena };
  }
  if (databaseUrl === undefined) {
    const response = await secrets.send(new GetSecretValueCommand({
      SecretId: requiredEnv("DATABASE_URL_SECRET_ARN"),
    }));
    databaseUrl = response.SecretString;
    if (databaseUrl === undefined) throw new Error("database URL secret has no string value");
  }
  pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const database = drizzle({ client: pool });
  runStore = new DrizzleRefreshRunStore(database);
  repository = new DrizzleAnalyticsRepository(database);
  athena = new AthenaGatewayAdapter({
    region: process.env.AWS_REGION ?? "us-east-1",
  });
  return { runStore, repository, athena };
}

function mergeQueryIds(
  existing: Readonly<Partial<Record<string, string>>>,
  additions: WorkflowEvent["queryExecutionIds"],
): Readonly<Partial<Record<string, string>>> {
  const merged = { ...existing };
  for (const query of additions ?? []) merged[query.metricType] = query.queryExecutionId;
  return merged;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}
