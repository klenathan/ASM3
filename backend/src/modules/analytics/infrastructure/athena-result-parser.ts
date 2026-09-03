import type { AthenaActionMetricRow } from "../application/refresh-run.ports";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AthenaResultRow = readonly (string | null | undefined)[];

export function parseActionAthenaResultRows(
  columnNames: readonly string[],
  rows: readonly AthenaResultRow[],
): readonly AthenaActionMetricRow[] {
  const indexes = new Map(columnNames.map((name, index) => [name, index]));
  for (const name of [
    "metric_kind", "grain", "society_id", "target_type", "target_id",
    "thread_id", "period_start", "period_end", "snapshot_at", "data",
  ]) {
    if (!indexes.has(name)) throw new Error(`Athena action result is missing column: ${name}`);
  }
  const dataRows = rows.length > 0 && isHeaderRow(rows[0]!, columnNames) ? rows.slice(1) : rows;
  return dataRows.map((row, index) => {
    const metricKind = requiredValue(row, indexes.get("metric_kind")!, index, "metric_kind");
    const grain = requiredValue(row, indexes.get("grain")!, index, "grain");
    if (!["activity", "current_state", "reconciliation"].includes(metricKind)) {
      throw new Error(`Athena action result row ${index + 1} has invalid metric_kind`);
    }
    if (!["platform", "society", "content"].includes(grain)) {
      throw new Error(`Athena action result row ${index + 1} has invalid grain`);
    }
    const rawData = requiredValue(row, indexes.get("data")!, index, "data");
    let data: unknown;
    try { data = JSON.parse(rawData); } catch (error) {
      throw new Error(`Athena action result row ${index + 1} has invalid data JSON`, { cause: error });
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`Athena action result row ${index + 1} data must be an object`);
    }
    return {
      metricKind: metricKind as AthenaActionMetricRow["metricKind"],
      grain: grain as AthenaActionMetricRow["grain"],
      societyId: parseOptionalUuid(row[indexes.get("society_id")!], "society_id", index),
      targetType: parseTargetType(row[indexes.get("target_type")!], index),
      targetId: parseOptionalUuid(row[indexes.get("target_id")!], "target_id", index),
      threadId: parseOptionalUuid(row[indexes.get("thread_id")!], "thread_id", index),
      periodStart: parseDate(requiredValue(row, indexes.get("period_start")!, index, "period_start"), "period_start"),
      periodEnd: parseDate(requiredValue(row, indexes.get("period_end")!, index, "period_end"), "period_end"),
      snapshotAt: parseOptionalDate(row[indexes.get("snapshot_at")!], "snapshot_at"),
      data: normalizeActionMetricData(data),
    };
  });
}

/** Athena names ROW fields in snake_case; the domain contract uses camelCase. */
function normalizeActionMetricData(data: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      const normalizedKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return [normalizedKey, ACTION_DATA_TIMESTAMP_FIELDS[normalizedKey] === true ? normalizeTimestamp(value) : value];
    }),
  );
}

const ACTION_DATA_TIMESTAMP_FIELDS: Record<string, true> = {
  firstActivityAt: true,
  lastActivityAt: true,
  snapshotAt: true,
  previousSnapshotAt: true,
  currentSnapshotAt: true,
};

function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const naiveTimestamp = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?: UTC)?$/.exec(value);
  const timestamp = new Date(
    naiveTimestamp === null ? value : `${naiveTimestamp[1]}T${naiveTimestamp[2]}Z`,
  );
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function parseOptionalUuid(value: string | null | undefined, column: string, rowIndex: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!UUID_PATTERN.test(value)) throw new Error(`Athena action result row ${rowIndex + 1} has invalid ${column}`);
  return value;
}

function parseTargetType(value: string | null | undefined, rowIndex: number): "thread" | "comment" | null {
  if (value === undefined || value === null || value === "") return null;
  if (value !== "thread" && value !== "comment") {
    throw new Error(`Athena action result row ${rowIndex + 1} has invalid target_type`);
  }
  return value;
}

function parseOptionalDate(value: string | null | undefined, column: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  return parseDate(value, column);
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


function parseDate(value: string, column: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Athena result has invalid ${column}: ${value}`);
  return date;
}
