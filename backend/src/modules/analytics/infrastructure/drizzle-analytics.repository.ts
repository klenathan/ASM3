import { and, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";


import type { Database } from "../../../db/client";
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
import { analyticsActionMetrics } from "./action-metrics.tables";
import { actionEvents, analyticsContractState } from "./action-event.tables";

export class DrizzleAnalyticsRepository implements ActionMetricsRepository {
  private readonly executor: Database;

  constructor(executor: Database) {
    this.executor = executor;
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
  async deleteIngestedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.executor.delete(actionEvents)
      .where(lt(actionEvents.ingestedAt, cutoff))
      .returning({ eventId: actionEvents.eventId });
    return deleted.length;
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
