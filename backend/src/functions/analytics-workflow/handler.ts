import { randomUUID } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { AthenaGatewayAdapter } from "../../modules/analytics/infrastructure/athena-gateway";
import { DrizzleAnalyticsRepository } from "../../modules/analytics/infrastructure/drizzle-analytics.repository";
import { DrizzleRefreshRunStore } from "../../modules/analytics/infrastructure/drizzle-refresh-run.store";
import type {
  AthenaMetricRow,
  RefreshRunStatus,
  RefreshRunStore,
} from "../../modules/analytics/application/refresh-run.ports";
import { createActionAthenaSqlCatalog } from "../../modules/analytics/infrastructure/action-athena-sql-catalog";
import { createAthenaMetricSqlCatalog } from "../../modules/analytics/infrastructure/athena-sql-catalog";
import { actionMetricDataSchema } from "../../modules/analytics/domain/action-metrics";
import { drizzle } from "drizzle-orm/node-postgres";
import { createWorkflowPool } from "./workflow-database";
import type { Pool } from "pg";
export interface WorkflowEvent {
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
export interface WorkflowDependencies {
  readonly runStore: Pick<RefreshRunStore, "get" | "save">;
  readonly repository: Pick<
    DrizzleAnalyticsRepository,
    "upsertActionMetrics" | "upsertMetrics" | "deleteIngestedBefore"
  >;
  readonly athena: Pick<AthenaGatewayAdapter, "getActionResults" | "getResults">;
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
  return processWorkflowEvent(event, dependencies);
}

export async function processWorkflowEvent(
  event: WorkflowEvent,
  dependencies: WorkflowDependencies,
): Promise<{
  readonly runId: string;
  readonly status: RefreshRunStatus;
  readonly queries?: readonly { readonly metricType: string; readonly sql: string }[];
}> {
  const run = await dependencies.runStore.get(event.runId);
  if (run === null) throw new Error(`analytics refresh run ${event.runId} was not found`);
  if (run.status === "cancelled") return { runId: run.runId, status: run.status };
  if (event.action === "prepare") {
    const saved = await dependencies.runStore.save({
      ...run,
      status: "querying",
      glueJobRunId: event.glueJobRunId ?? run.glueJobRunId,
      updatedAt: new Date(),
    });
    const catalog = saved.contractVersion === 2
      ? createActionAthenaSqlCatalog(saved.runId, saved.periodStart!, saved.periodEnd!)
      : createAthenaMetricSqlCatalog(saved.runId);
    return {
      runId: saved.runId,
      status: saved.status,
      queries: Object.entries(catalog).map(([metricType, sql]) => ({ metricType, sql: sql as string })),
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
  if (run.contractVersion === 2) {
    const actionRows = [];
    for (const query of queryIds) {
      actionRows.push(...await dependencies.athena.getActionResults(query.queryExecutionId));
    }
    const now = new Date();
    await dependencies.repository.upsertActionMetrics(actionRows.map((row) => {
      const data = actionMetricDataSchema.parse({ metricKind: row.metricKind, data: row.data });
      return {
        id: randomUUID(),
        contractVersion: 2 as const,
        metricKind: row.metricKind,
        grain: row.grain,
        societyId: row.societyId,
        targetType: row.targetType,
        targetId: row.targetId,
        threadId: row.threadId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        snapshotAt: row.snapshotAt,
        data,
        refreshRunId: run.runId,
        createdAt: now,
        updatedAt: now,
      };
    }));
    const rawRetentionDays = process.env.ANALYTICS_RAW_EVENT_RETENTION_DAYS
      ?? process.env.ANALYTICS_RAW_RETENTION_DAYS
      ?? "30";
    const retentionDays = Number(rawRetentionDays);
    if (!Number.isFinite(retentionDays) || retentionDays < 0) {
      throw new Error("ANALYTICS_RAW_EVENT_RETENTION_DAYS must be a non-negative number");
    }
    await dependencies.repository.deleteIngestedBefore(
      new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
    );
  } else {
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
  }

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
  pool = createWorkflowPool(databaseUrl);
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
