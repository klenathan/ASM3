import type { AthenaMetricRow } from "../application/refresh-orchestrator.ports";
import { assertMetricType } from "../domain/analytics";

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

    return {
      metricType,
      societyId: optionalValue(row, indexes.get("society_id")!) || null,
      periodStart,
      periodEnd,
      data: data as AthenaMetricRow["data"],
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

function parseDate(value: string, column: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Athena result has invalid ${column}: ${value}`);
  return date;
}
