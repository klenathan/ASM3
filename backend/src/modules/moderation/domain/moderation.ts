import { ApplicationError } from "../../../shared/domain/errors";

export type ReportStatus = "pending" | "in_review" | "resolved" | "dismissed";
export type ReportTargetType = "thread" | "comment";
export type ModerationResolution = "remove_content" | "ban_member" | "suspend_user";

export interface ReportRecord {
  readonly id: string;
  readonly societyId: string;
  readonly reporterId: string;
  readonly threadId: string | null;
  readonly commentId: string | null;
  readonly reason: string;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly assignedTo: string | null;
  readonly resolution: string | null;
  readonly resolutionNote: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
}

export interface ModerationActionRecord {
  readonly id: string;
  readonly societyId: string | null;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: "user" | "membership" | "thread" | "comment" | "report";
  readonly targetId: string;
  readonly reason: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export function assertReportStatus(value: string): ReportStatus {
  if (
    value !== "pending" &&
    value !== "in_review" &&
    value !== "resolved" &&
    value !== "dismissed"
  ) {
    throw new ApplicationError("MODERATION_DATA_INVALID", "The report contains invalid state");
  }

  return value;
}

export function assertModerationResolution(value: string): ModerationResolution {
  if (value !== "remove_content" && value !== "ban_member" && value !== "suspend_user") {
    throw new ApplicationError("VALIDATION_ERROR", "The moderation resolution is invalid");
  }

  return value;
}

export function assertExactlyOneTarget(
  threadId: string | undefined,
  commentId: string | undefined,
): ReportTargetType {
  if ((threadId === undefined) === (commentId === undefined)) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "A report must target exactly one thread or comment",
    );
  }

  return threadId === undefined ? "comment" : "thread";
}

export function isVisibleOrRetained(status: "published" | "removed" | "deleted"): boolean {
  return status === "published" || status === "removed";
}

export function normalizeReportReason(value: string): string {
  return normalizeText(value, 200, "Report reason");
}

export function normalizeReportDetails(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeText(value, 1_000, "Report details");
}

export function normalizeResolutionNote(value: string | undefined): string | null {
  return value === undefined ? null : normalizeText(value, 1_000, "Resolution note");
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
