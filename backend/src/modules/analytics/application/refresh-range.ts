import { ApplicationError } from "../../../shared/domain/errors";

export interface RefreshRange {
  readonly periodStart: string;
  readonly periodEnd: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeRefreshRange(range: RefreshRange, now = new Date()): RefreshRange {
  if (!DATE_RE.test(range.periodStart) || !DATE_RE.test(range.periodEnd)) {
    throw new ApplicationError("VALIDATION_ERROR", "Refresh dates must use YYYY-MM-DD");
  }
  const start = Date.parse(`${range.periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${range.periodEnd}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || range.periodStart >= range.periodEnd) {
    throw new ApplicationError("VALIDATION_ERROR", "periodStart must be before periodEnd");
  }
  const maxEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  if (end > maxEnd) {
    throw new ApplicationError("VALIDATION_ERROR", "periodEnd cannot be later than tomorrow UTC");
  }
  if (end - start > 31 * 24 * 60 * 60 * 1000) {
    throw new ApplicationError("VALIDATION_ERROR", "Refresh range cannot exceed 31 days");
  }
  return { periodStart: range.periodStart, periodEnd: range.periodEnd };
}

export function previousUtcDay(now = new Date()): RefreshRange {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}
