export type MetricType = "user_growth" | "content_volume" | "top_societies" | "moderation";

export const METRIC_TYPES: readonly MetricType[] = [
  "user_growth",
  "content_volume",
  "top_societies",
  "moderation",
];

export function assertMetricType(value: string): MetricType {
  if (!METRIC_TYPES.includes(value as MetricType)) {
    throw new Error(`Invalid metric type: ${value}`);
  }
  return value as MetricType;
}

export interface UserGrowthData {
  readonly registrations: number;
  readonly activeUsers: number;
  readonly totalUsers: number;
  readonly suspensions: number;
}

export interface ContentVolumeData {
  readonly threads: number;
  readonly comments: number;
  readonly votes: number;
  readonly reports: number;
}

export interface TopSocietyEntry {
  readonly societyId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly threadCount: number;
}

export interface TopSocietiesData {
  readonly topByMembers: readonly TopSocietyEntry[];
  readonly topByThreads: readonly TopSocietyEntry[];
}

export interface ModerationData {
  readonly pendingReports: number;
  readonly resolvedToday: number;
  readonly avgResolutionHours: number;
  readonly totalReports: number;
}

export type MetricPayload = UserGrowthData | ContentVolumeData | TopSocietiesData | ModerationData;

/** Convert persisted pipeline payload keys to API/domain camelCase keys. */
export function normalizeMetricPayload(data: MetricPayload): MetricPayload {
  return camelizeKeys(data) as MetricPayload;
}

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      camelizeKeys(entry),
    ]),
  );
}

export interface AnalyticsMetricRecord {
  readonly id: string;
  readonly metricType: MetricType;
  readonly societyId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly data: MetricPayload;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}