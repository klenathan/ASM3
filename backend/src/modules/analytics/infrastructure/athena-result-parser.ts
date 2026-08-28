import type { AthenaMetricRow } from "../application/refresh-run.ports";
import type {
  ContentVolumeData,
  MetricPayload,
  ModerationData,
  TopSocietiesData,
  UserGrowthData,
} from "../domain/analytics";
import { assertMetricType } from "../domain/analytics";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AthenaResultRow = readonly (string | null | undefined)[];

/** Convert Athena's stringly typed result rows into the application contract. */
export function parseAthenaResultRows(
  columnNames: readonly string[],
  rows: readonly AthenaResultRow[],
): readonly AthenaMetricRow[] {
  const indexes = new Map(columnNames.map((name, index) => [name, index]));
  for (const name of ["metric_type", "society_id", "period_start", "period_end", "data"]) {
    if (!indexes.has(name)) throw new Error(`Athena result is missing column: ${name}`);
  }

  const dataRows = rows.length > 0 && isHeaderRow(rows[0]!, columnNames)
    ? rows.slice(1)
    : rows;

  return dataRows.map((row, index) => {
    const metricType = assertMetricType(requiredValue(row, indexes.get("metric_type")!, index, "metric_type"));
    const periodStart = parseDate(requiredValue(row, indexes.get("period_start")!, index, "period_start"), "period_start");
    const periodEnd = parseDate(requiredValue(row, indexes.get("period_end")!, index, "period_end"), "period_end");
    const rawData = requiredValue(row, indexes.get("data")!, index, "data");

    let data: unknown;
    try {
      data = JSON.parse(rawData);
    } catch (error) {
      throw new Error(`Athena result row ${index + 1} has invalid data JSON`, { cause: error });
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`Athena result row ${index + 1} data must be a JSON object`);
    }
    const payload = validatePayload(metricType, data as Record<string, unknown>, index);

    return {
      metricType,
      societyId: parseSocietyId(optionalValue(row, indexes.get("society_id")!), index),
      periodStart,
      periodEnd,
      data: payload,
    };
  });
}

function isHeaderRow(row: AthenaResultRow, columnNames: readonly string[]): boolean {
  return columnNames.every((name, index) => row[index] === name);
}

function requiredValue(
  row: AthenaResultRow,
  index: number,
  rowIndex: number,
  column: string,
): string {
  const value = row[index];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Athena result row ${rowIndex + 1} has empty ${column}`);
  }
  return value;
}

function optionalValue(row: AthenaResultRow, index: number): string | null {
  const value = row[index];
  return value === undefined || value === null ? null : value;
}

function parseSocietyId(value: string | null, rowIndex: number): string | null {
  if (value === null || value === "") return null;
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Athena result row ${rowIndex + 1} has invalid society_id`);
  }
  return value;
}

function parseDate(value: string, column: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Athena result has invalid ${column}: ${value}`);
  return date;
}

function validatePayload(
  metricType: AthenaMetricRow["metricType"],
  data: Record<string, unknown>,
  rowIndex: number,
): MetricPayload {
  switch (metricType) {
    case "user_growth":
      return numericPayload<UserGrowthData>(data, [
        "registrations",
        "active_users",
        "total_users",
        "suspensions",
      ], rowIndex);
    case "content_volume":
      return numericPayload<ContentVolumeData>(data, [
        "threads",
        "comments",
        "votes",
        "reports",
      ], rowIndex);
    case "moderation":
      return numericPayload<ModerationData>(data, [
        "pending_reports",
        "resolved_today",
        "avg_resolution_hours",
        "total_reports",
      ], rowIndex);
    case "top_societies":
      return topSocietiesPayload(data, rowIndex);
  }
}

function numericPayload<T extends object>(
  data: Record<string, unknown>,
  fields: readonly string[],
  rowIndex: number,
): T {
  for (const field of fields) {
    if (typeof data[field] !== "number" || !Number.isFinite(data[field])) {
      throw new Error(`Athena result row ${rowIndex + 1} has invalid data field: ${field}`);
    }
  }
  return data as T;
}

function topSocietiesPayload(data: Record<string, unknown>, rowIndex: number): TopSocietiesData {
  for (const field of ["top_by_members", "top_by_threads"]) {
    const entries = data[field];
    if (!Array.isArray(entries)) {
      throw new Error(`Athena result row ${rowIndex + 1} has invalid data field: ${field}`);
    }
    for (const entry of entries) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        typeof entry.society_id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.member_count !== "number" ||
        typeof entry.thread_count !== "number"
      ) {
        throw new Error(`Athena result row ${rowIndex + 1} has invalid society entry`);
      }
    }
  }
  return data as unknown as TopSocietiesData;
}
