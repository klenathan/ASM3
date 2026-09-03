import type { AnalyticsMetricRecord, MetricType, MetricPayload } from "../domain/analytics";

export interface UpsertAnalyticsMetricInput {
  readonly id: string;
  readonly metricType: MetricType;
  readonly societyId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly data: MetricPayload;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AnalyticsQuery {
  readonly metricType?: MetricType | undefined;
  readonly societyId?: string | undefined;
  readonly periodStart?: Date | undefined;
  readonly periodEnd?: Date | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface AnalyticsPageResult {
  readonly metrics: readonly AnalyticsMetricRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface AnalyticsRepository {
  findMetrics(query: AnalyticsQuery): Promise<AnalyticsPageResult>;
  upsertMetric(input: UpsertAnalyticsMetricInput): Promise<AnalyticsMetricRecord>;
  upsertMetrics(inputs: readonly UpsertAnalyticsMetricInput[]): Promise<readonly AnalyticsMetricRecord[]>;
  findLatestPeriod(): Promise<Date | null>;
}
