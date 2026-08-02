import { InvalidCursorError } from "../domain/errors";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type CursorValue = string | number;

export interface Cursor {
  readonly value: CursorValue;
  readonly id: string;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(encoded: string): Cursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );

    if (!isCursor(decoded)) {
      throw new Error("cursor shape is invalid");
    }

    return decoded;
  } catch {
    throw new InvalidCursorError();
  }
}

export function cursorFor(value: CursorValue | Date, id: string): Cursor {
  return {
    value: value instanceof Date ? value.toISOString() : value,
    id,
  };
}

export function normalizePageSize(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_PAGE_SIZE;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("page size must be a positive integer");
  }

  return Math.min(limit, MAX_PAGE_SIZE);
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const cursorValue = candidate.value;
  const hasValidValue =
    typeof cursorValue === "string" ||
    (typeof cursorValue === "number" && Number.isFinite(cursorValue));

  return (
    hasValidValue &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0
  );
}
