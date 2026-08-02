import type { ModerationResolution, ReportRecord, ReportStatus, ReportTargetType } from "../domain/moderation.js";

export interface CreateReportCommand {
  readonly societyId: string;
  readonly threadId?: string;
  readonly commentId?: string;
  readonly reason: string;
  readonly details?: string;
}

export interface ResolveReportCommand {
  readonly action: ModerationResolution;
  readonly resolutionNote?: string;
  readonly suspendedUntil?: Date | null;
}

export interface DismissReportCommand {
  readonly resolutionNote?: string;
}

export interface ReportDto {
  readonly id: string;
  readonly societyId: string;
  readonly reporterId: string;
  readonly threadId: string | null;
  readonly commentId: string | null;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reason: string;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly assignedTo: string | null;
  readonly resolution: string | null;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
}

export interface ReportPageDto {
  readonly items: readonly ReportDto[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export function reportTarget(record: ReportRecord): {
  readonly type: ReportTargetType;
  readonly id: string;
} {
  if (record.threadId !== null) return { type: "thread", id: record.threadId };
  if (record.commentId !== null) return { type: "comment", id: record.commentId };
  throw new Error("Report has no target");
}
