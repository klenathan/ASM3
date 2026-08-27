import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../../../db/client";
import { METRIC_TYPES, type MetricType } from "../domain/analytics";
import type {
  RefreshRunRecord,
  RefreshRunStore,
  RefreshRunStatus,
  RefreshRunTrigger,
} from "../application/refresh-orchestrator.ports";
import { analyticsRefreshRuns } from "./refresh-run.tables";

const UNFINISHED_STATUSES: readonly RefreshRunStatus[] = [
  "requested",
  "exporting",
  "querying",
];

export class DrizzleRefreshRunStore implements RefreshRunStore {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async findActiveRun(): Promise<RefreshRunRecord | null> {
    const rows = await this.database
      .select()
      .from(analyticsRefreshRuns)
      .where(inArray(analyticsRefreshRuns.status, UNFINISHED_STATUSES))
      .orderBy(asc(analyticsRefreshRuns.createdAt))
      .limit(1);
    return rows[0] === undefined ? null : toRecord(rows[0]);
  }

  async get(runId: string): Promise<RefreshRunRecord | null> {
    const rows = await this.database
      .select()
      .from(analyticsRefreshRuns)
      .where(eq(analyticsRefreshRuns.runId, runId))
      .limit(1);
    return rows[0] === undefined ? null : toRecord(rows[0]);
  }

  async listUnfinishedRuns(): Promise<readonly RefreshRunRecord[]> {
    const rows = await this.database
      .select()
      .from(analyticsRefreshRuns)
      .where(inArray(analyticsRefreshRuns.status, UNFINISHED_STATUSES))
      .orderBy(asc(analyticsRefreshRuns.createdAt));
    return rows.map(toRecord);
  }

  async save(run: RefreshRunRecord): Promise<RefreshRunRecord> {
    const existing = await this.get(run.runId);
    if (existing !== null) {
      const rows = await this.database
        .update(analyticsRefreshRuns)
        .set(toRow(run))
        .where(eq(analyticsRefreshRuns.runId, run.runId))
        .returning();
      const updated = rows[0];
      if (updated === undefined) throw new Error(`refresh run ${run.runId} disappeared while saving`);
      return toRecord(updated);
    }

    const inserted = await this.database
      .insert(analyticsRefreshRuns)
      .values(toRow(run))
      .onConflictDoNothing()
      .returning();
    if (inserted[0] !== undefined) return toRecord(inserted[0]);

    // The partial unique index makes concurrent first requests converge on
    // the run that won the active slot instead of creating duplicate work.
    const active = await this.findActiveRun();
    if (active !== null) return active;
    throw new Error(`refresh run ${run.runId} could not be saved`);
  }

  async claim(
    runId: string,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null> {
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const rows = await this.database
      .update(analyticsRefreshRuns)
      .set({ leaseOwner: ownerId, leaseExpiresAt })
      .where(
        and(
          eq(analyticsRefreshRuns.runId, runId),
          inArray(analyticsRefreshRuns.status, UNFINISHED_STATUSES),
          or(
            isNull(analyticsRefreshRuns.leaseOwner),
            lte(analyticsRefreshRuns.leaseExpiresAt, now),
            eq(analyticsRefreshRuns.leaseOwner, ownerId),
          ),
        ),
      )
      .returning();
    return rows[0] === undefined ? null : toRecord(rows[0]);
  }

  async saveClaimed(
    run: RefreshRunRecord,
    ownerId: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<RefreshRunRecord | null> {
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const rows = await this.database
      .update(analyticsRefreshRuns)
      .set({ ...toRow(run), leaseOwner: ownerId, leaseExpiresAt })
      .where(
        and(
          eq(analyticsRefreshRuns.runId, run.runId),
          eq(analyticsRefreshRuns.leaseOwner, ownerId),
          gt(analyticsRefreshRuns.leaseExpiresAt, now),
          inArray(analyticsRefreshRuns.status, UNFINISHED_STATUSES),
        ),
      )
      .returning();
    return rows[0] === undefined ? null : toRecord(rows[0]);
  }
}

function toRow(run: RefreshRunRecord) {
  const athenaQueryExecutionIds = validateQueryIds(
    run.athenaQueryExecutionIds,
    run.runId,
  );
  return {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    attempts: run.attempts,
    lastError: run.lastError,
    glueJobRunId: run.glueJobRunId,
    athenaQueryExecutionIds,
  };
}

function toRecord(row: typeof analyticsRefreshRuns.$inferSelect): RefreshRunRecord {
  const status = row.status as RefreshRunStatus;
  const trigger = row.trigger as RefreshRunTrigger;
  if (!UNFINISHED_STATUSES.includes(status) && status !== "completed" && status !== "failed") {
    throw new Error(`invalid persisted refresh run status: ${row.status}`);
  }
  if (trigger !== "admin" && trigger !== "nightly") {
    throw new Error(`invalid persisted refresh run trigger: ${row.trigger}`);
  }

  const queryIds = row.athenaQueryExecutionIds;
  const safeQueryIds = validateQueryIds(queryIds, row.runId);

  return {
    runId: row.runId,
    trigger,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status,
    attempts: row.attempts,
    lastError: row.lastError,
    glueJobRunId: row.glueJobRunId,
    athenaQueryExecutionIds: safeQueryIds,
  };
}

function validateQueryIds(
  queryIds: unknown,
  runId: string,
): Partial<Record<MetricType, string>> {
  if (queryIds === null || typeof queryIds !== "object" || Array.isArray(queryIds)) {
    throw new Error(`invalid Athena query id map for refresh run ${runId}`);
  }
  const safeQueryIds: Partial<Record<MetricType, string>> = {};
  for (const [key, value] of Object.entries(queryIds)) {
    if (!METRIC_TYPES.includes(key as MetricType) || typeof value !== "string" || value.length === 0) {
      throw new Error(`invalid Athena query id map for refresh run ${runId}`);
    }
    safeQueryIds[key as MetricType] = value;
  }
  return safeQueryIds;
}
