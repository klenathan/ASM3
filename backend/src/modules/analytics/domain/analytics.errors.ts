import { ApplicationError } from "../../../shared/domain/errors";

export class AnalyticsRefreshBusyError extends ApplicationError {
  constructor(activeRun: { runId: string; periodStart?: string; periodEnd?: string }) {
    super(
      "ANALYTICS_REFRESH_BUSY",
      "Another analytics refresh is already in progress",
      {
        activeRunId: activeRun.runId,
        periodStart: activeRun.periodStart ?? null,
        periodEnd: activeRun.periodEnd ?? null,
      },
    );
  }
}