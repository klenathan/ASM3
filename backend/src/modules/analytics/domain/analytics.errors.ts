import { ApplicationError } from "../../../shared/domain/errors";

export class AnalyticsForbiddenError extends ApplicationError {
  constructor() {
    super("ANALYTICS_FORBIDDEN", "Access to analytics data is restricted to system admins and society moderators");
  }
}

export class AnalyticsSocietyRequiredError extends ApplicationError {
  constructor() {
    super("ANALYTICS_SOCIETY_REQUIRED", "Moderators must specify a society_id to view analytics");
  }
}

export class AnalyticsSocietyNotModeratedError extends ApplicationError {
  constructor() {
    super("ANALYTICS_SOCIETY_NOT_MODERATED", "You are not a moderator of the requested society");
  }
}
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