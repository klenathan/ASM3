import { ApplicationError } from "../../../shared/domain/errors";

export type SocietyStatus = "active" | "archived";

/** Slug pattern(a lowercase letter/digit followed by letters, digits, underscores, or hyphens). */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Slugs that must not be claimable by a society because they conflict with reserved routes. */
export const RESERVED_SLUGS: readonly string[] = [
  "all",
  "admin",
  "mod",
  "mods",
  "feed",
  "search",
  "settings",
  "api",
  "media",
  "reports",
  "moderation",
];

export interface SocietyRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly avatarMediaId: string;
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
  if (!SLUG_PATTERN.test(slug)) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Society slug may only contain lowercase letters, digits, and underscores",
    );
  }
  if (RESERVED_SLUGS.includes(slug)) {
    throw new ApplicationError("VALIDATION_ERROR", "This society slug is reserved and cannot be used");
  }

  return slug;
}

export function normalizeSlugForLookup(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

export function normalizeSocietyName(value: string): string {
  return normalizeText(value, 100, "Society name");
}

export function normalizeSocietyDescription(value: string): string {
  return normalizeText(value, 1000, "Society description");
}

export function normalizeAvatarMediaId(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "A society must have a profile picture (avatarMediaId)",
    );
  }

  return value.trim().toLowerCase();
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
