import type { MetricType, MetricPayload } from "../domain/analytics";

export interface AnalyticsMetricDto {
  readonly id: string;
  readonly metricType: MetricType;
  readonly societyId: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly data: MetricPayload;
}

export interface AnalyticsPageDto {
  readonly metrics: readonly AnalyticsMetricDto[];
  readonly page: {
    readonly cursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface QueryMetricsRequest {
  readonly metricType?: MetricType | undefined;
  readonly societyId?: string | undefined;
  readonly periodStart?: string | undefined;
  readonly periodEnd?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface RefreshStatusDto {
  readonly runId: string;
  readonly trigger: "admin" | "nightly";
  readonly status: "requested" | "exporting" | "querying" | "completed" | "failed";
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RefreshResponse {
  readonly accepted: boolean;
  readonly message: string;
  readonly runId?: string;
  readonly status?: RefreshStatusDto["status"];
}