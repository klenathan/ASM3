import { ApplicationError } from "../../../shared/domain/errors";

export type SocietyStatus = "active" | "archived";

export interface SocietyRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly status: SocietyStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SocietyRuleRecord {
  readonly id: string;
  readonly societyId: string;
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (slug.length === 0 || slug.length > 64) {
    throw new ApplicationError("VALIDATION_ERROR", "Society slug must be between 1 and 64 characters");
  }

  return slug;
}

export function normalizeSocietyName(value: string): string {
  return normalizeText(value, 100, "Society name");
}

export function normalizeSocietyDescription(value: string): string {
  return normalizeText(value, 1000, "Society description");
}

export function normalizeRuleTitle(value: string): string {
  return normalizeText(value, 100, "Rule title");
}

export function normalizeRuleDescription(value: string): string {
  return normalizeText(value, 500, "Rule description");
}

export function normalizeRulePosition(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 32_767) {
    throw new ApplicationError("VALIDATION_ERROR", "Rule position must be a positive integer");
  }

  return value;
}

export function assertActiveSociety(society: SocietyRecord): void {
  if (society.status !== "active") {
    throw new ApplicationError("SOCIETY_FORBIDDEN", "This society is not accepting changes");
  }
}

function normalizeText(value: string, maxLength: number, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${field} must be between 1 and ${maxLength} characters`,
    );
  }

  return normalized;
}

export function assertSocietyStatus(value: string): SocietyStatus {
  if (value !== "active" && value !== "archived") {
    throw new ApplicationError("SOCIETY_DATA_INVALID", "The society contains invalid state");
  }

  return value;
}
