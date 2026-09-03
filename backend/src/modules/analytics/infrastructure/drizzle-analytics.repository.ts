import { and, desc, eq, gte, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { Database } from "../../../db/client";
import type {
  AnalyticsMetricRecord,
  MetricPayload,
  MetricType,
} from "../domain/analytics";
import type {
  ActionMetricRecord,
  ActionMetricGrain,
} from "../domain/action-metrics";
import { actionMetricDataSchema } from "../domain/action-metrics";
import type {
  ActionMetricsQuery,
  ActionMetricsPage,
  ActionMetricsRepository,
  UpsertActionMetricsInput,
} from "../application/action-metrics.repository";
import type {
  AnalyticsQuery,
  AnalyticsPageResult,
  AnalyticsRepository,
  UpsertAnalyticsMetricInput,
} from "../application/analytics.repository";
import { analyticsMetrics } from "./analytics.tables";
import { analyticsActionMetrics } from "./action-metrics.tables";
import { analyticsContractState } from "./action-event.tables";

export class DrizzleAnalyticsRepository implements AnalyticsRepository, ActionMetricsRepository {
  private readonly executor: Database;

  constructor(executor: Database) {
    this.executor = executor;
  }

  async findMetrics(query: AnalyticsQuery): Promise<AnalyticsPageResult> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.metricType !== undefined) {
      conditions.push(eq(analyticsMetrics.metricType, query.metricType));
    }
    if (query.societyId !== undefined) {
      if (query.societyId === "null" || query.societyId === "") {
        conditions.push(sql`${analyticsMetrics.societyId} IS NULL`);
      } else {
        conditions.push(eq(analyticsMetrics.societyId, query.societyId));
      }
    }
    if (query.periodStart !== undefined) {
      conditions.push(gte(analyticsMetrics.periodStart, query.periodStart));
    }
    if (query.periodEnd !== undefined) {
      conditions.push(lte(analyticsMetrics.periodEnd, query.periodEnd));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = (query.limit ?? 20) + 1;

    let rows;
    if (query.cursor !== undefined) {
      rows = await this.executor
        .select()
        .from(analyticsMetrics)
        .where(
          and(
            where,
            lt(analyticsMetrics.id, query.cursor),
          ),
        )
        .orderBy(desc(analyticsMetrics.periodStart), desc(analyticsMetrics.id))
        .limit(limit);
    } else {
      rows = await this.executor
        .select()
        .from(analyticsMetrics)
        .where(where)
        .orderBy(desc(analyticsMetrics.periodStart), desc(analyticsMetrics.id))
        .limit(limit);
    }

    const hasMore = rows.length > (query.limit ?? 20);
    const items = hasMore ? rows.slice(0, query.limit ?? 20) : rows;

    return {
      metrics: items.map(toRecord),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async upsertMetric(input: UpsertAnalyticsMetricInput): Promise<AnalyticsMetricRecord> {
    const id = input.id ?? randomUUID();
    const now = new Date();
    const data = input.data as unknown as Record<string, unknown>;

    const conflictTarget = input.societyId === null
      ? {
          target: [analyticsMetrics.metricType, analyticsMetrics.periodStart],
          targetWhere: sql`${analyticsMetrics.societyId} IS NULL`,
        }
      : {
          target: [
            analyticsMetrics.metricType,
            analyticsMetrics.societyId,
            analyticsMetrics.periodStart,
          ],
          targetWhere: sql`${analyticsMetrics.societyId} IS NOT NULL`,
        };

    const rows = await this.executor
      .insert(analyticsMetrics)
      .values({
        id,
        metricType: input.metricType,
        societyId: input.societyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        data,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        ...conflictTarget,
        set: {
          data,
          periodEnd: input.periodEnd,
          updatedAt: now,
        },
      })
      .returning();

    const row = rows[0];
    if (row !== undefined) return toRecord(row);

    // Fallback: select-then-upsert
    const existing = await this.executor
      .select()
      .from(analyticsMetrics)
      .where(
        and(
          eq(analyticsMetrics.metricType, input.metricType),
          input.societyId === null
            ? sql`${analyticsMetrics.societyId} IS NULL`
            : eq(analyticsMetrics.societyId, input.societyId),
          eq(analyticsMetrics.periodStart, input.periodStart),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const updated = await this.executor
        .update(analyticsMetrics)
        .set({
          data,
          periodEnd: input.periodEnd,
          updatedAt: now,
        })
        .where(eq(analyticsMetrics.id, existing[0]!.id))
        .returning();
      const updatedRow = updated[0];
      if (updatedRow === undefined) throw new Error("Failed to upsert analytics metric");
      return toRecord(updatedRow);
    }

    // Final fallback: insert without conflict handling
    const inserted = await this.executor
      .insert(analyticsMetrics)
      .values({
        id,
        metricType: input.metricType,
        societyId: input.societyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        data,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      })
      .returning();
    const insertedRow = inserted[0];
    if (insertedRow === undefined) throw new Error("Failed to insert analytics metric");
    return toRecord(insertedRow);
  }

  async upsertMetrics(
    inputs: readonly UpsertAnalyticsMetricInput[],
  ): Promise<readonly AnalyticsMetricRecord[]> {
    return this.executor.transaction(async (transaction) => {
      const repository = new DrizzleAnalyticsRepository(transaction as unknown as Database);
      const records: AnalyticsMetricRecord[] = [];
      for (const input of inputs) records.push(await repository.upsertMetric(input));
      return records;
    });
  }

  async findLatestPeriod(): Promise<Date | null> {
    const rows = await this.executor
      .select({ periodStart: analyticsMetrics.periodStart })
      .from(analyticsMetrics)
      .orderBy(desc(analyticsMetrics.periodStart))
      .limit(1);

    return rows[0]?.periodStart ?? null;
  }
  async findActionMetrics(query: ActionMetricsQuery): Promise<ActionMetricsPage> {
    const conditions = [];
    if (query.grain !== undefined) conditions.push(eq(analyticsActionMetrics.grain, query.grain));
    if (query.societyId !== undefined) conditions.push(eq(analyticsActionMetrics.societyId, query.societyId));
    if (query.targetType !== undefined) conditions.push(eq(analyticsActionMetrics.targetType, query.targetType));
    if (query.targetId !== undefined) conditions.push(eq(analyticsActionMetrics.targetId, query.targetId));
    if (query.periodStart !== undefined) conditions.push(gte(analyticsActionMetrics.periodStart, query.periodStart));
    if (query.periodEnd !== undefined) conditions.push(lt(analyticsActionMetrics.periodStart, query.periodEnd));
    if (query.cursor !== undefined) conditions.push(lt(analyticsActionMetrics.id, query.cursor));
    const limit = Math.min(query.limit ?? 20, 100);
    const rows = await this.executor.select().from(analyticsActionMetrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(analyticsActionMetrics.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      metrics: items.map(toActionMetricRecord),
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      hasMore,
    };
  }

  async upsertActionMetrics(metrics: readonly UpsertActionMetricsInput[]): Promise<void> {
    await this.executor.transaction(async (transaction) => {
      for (const metric of metrics) {
        const parsed = actionMetricDataSchema.safeParse(metric.data);
        let uniqueDimensions: SQL;
        if (metric.grain === "platform") {
          uniqueDimensions = isNull(analyticsActionMetrics.societyId);
        } else if (metric.grain === "society") {
          if (metric.societyId === null) throw new Error("Society metrics require a society ID");
          uniqueDimensions = eq(analyticsActionMetrics.societyId, metric.societyId);
        } else {
          if (metric.targetType === null || metric.targetId === null) {
            throw new Error("Content metrics require a target");
          }
          uniqueDimensions = and(
            eq(analyticsActionMetrics.targetType, metric.targetType),
            eq(analyticsActionMetrics.targetId, metric.targetId),
          )!;
        }
        await transaction.delete(analyticsActionMetrics).where(and(
          eq(analyticsActionMetrics.contractVersion, 2),
          eq(analyticsActionMetrics.metricKind, metric.metricKind),
          eq(analyticsActionMetrics.periodStart, metric.periodStart),
          uniqueDimensions,
        ));
        if (!parsed.success) throw new Error("Invalid v2 analytics metric payload");
        await transaction.insert(analyticsActionMetrics).values({
          id: metric.id,
          contractVersion: 2,
          metricKind: metric.metricKind,
          grain: metric.grain,
          societyId: metric.societyId,
          targetType: metric.targetType,
          targetId: metric.targetId,
          threadId: metric.threadId,
          periodStart: metric.periodStart,
          periodEnd: metric.periodEnd,
          snapshotAt: metric.snapshotAt,
          data: parsed.data.data,
          refreshRunId: metric.refreshRunId,
          createdAt: metric.createdAt,
          updatedAt: metric.updatedAt,
        }).onConflictDoUpdate({
          target: [analyticsActionMetrics.id],
          set: { data: parsed.data.data, updatedAt: metric.updatedAt, periodEnd: metric.periodEnd, snapshotAt: metric.snapshotAt },
        });
      }
    });
  }
  async getRecordingStartedAt(contractVersion: 2): Promise<Date> {
    const rows = await this.executor.select({ recordingStartedAt: analyticsContractState.recordingStartedAt })
      .from(analyticsContractState)
      .where(eq(analyticsContractState.contractVersion, contractVersion))
      .limit(1);
    const startedAt = rows[0]?.recordingStartedAt;
    if (startedAt === undefined) throw new Error("Analytics contract state is not initialized");
    return startedAt;
  }
}

function toActionMetricRecord(row: typeof analyticsActionMetrics.$inferSelect): ActionMetricRecord {
  const parsed = actionMetricDataSchema.parse({ metricKind: row.metricKind, data: row.data });
  return {
    id: row.id,
    contractVersion: 2,
    metricKind: parsed.metricKind,
    grain: row.grain as ActionMetricGrain,
    societyId: row.societyId,
    targetType: row.targetType,
    targetId: row.targetId,
    threadId: row.threadId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    snapshotAt: row.snapshotAt,
    data: parsed,
    refreshRunId: row.refreshRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRecord(row: typeof analyticsMetrics.$inferSelect): AnalyticsMetricRecord {
  return {
    id: row.id,
    metricType: row.metricType as MetricType,
    societyId: row.societyId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    data: row.data as unknown as MetricPayload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
