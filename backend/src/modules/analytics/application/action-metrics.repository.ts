import type { ActionMetricRecord, ActionMetricGrain } from "../domain/action-metrics";
export interface UpsertActionMetricsInput extends ActionMetricRecord {}

export interface ActionMetricsQuery {
  readonly grain?: ActionMetricGrain;
  readonly societyId?: string;
  readonly targetType?: "thread" | "comment";
  readonly targetId?: string;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ActionMetricsPage {
  readonly metrics: readonly ActionMetricRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ActionMetricsRepository {
  findActionMetrics(query: ActionMetricsQuery): Promise<ActionMetricsPage>;
  upsertActionMetrics(metrics: readonly ActionMetricRecord[]): Promise<void>;
}

export interface ContractStateReader {
  getRecordingStartedAt(contractVersion: 2): Promise<Date>;
}
