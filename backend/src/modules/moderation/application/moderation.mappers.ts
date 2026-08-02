import type { ReportDto, ReportPageDto } from "./moderation.dto";
import { reportTarget } from "./moderation.dto";
import type { ReportRecord } from "../domain/moderation";
import type { PageResult } from "../../../shared/application/pagination";

export function toReportDto(record: ReportRecord): ReportDto {
  const target = reportTarget(record);
  return {
    id: record.id,
    societyId: record.societyId,
    reporterId: record.reporterId,
    threadId: record.threadId,
    commentId: record.commentId,
    targetType: target.type,
    targetId: target.id,
    reason: record.reason,
    details: record.details,
    status: record.status,
    assignedTo: record.assignedTo,
    resolution: record.resolution,
    resolutionNote: record.resolutionNote,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedBy: record.resolvedBy,
  };
}

export function toReportPageDto(result: PageResult<ReportRecord>): ReportPageDto {
  return {
    items: result.items.map(toReportDto),
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}
