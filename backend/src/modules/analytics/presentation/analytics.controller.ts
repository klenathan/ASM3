import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { AppError } from "../../../shared/domain/errors";
import { ApplicationError } from "../../../shared/domain/errors";
import type { AnalyticsService } from "../application/analytics.service";
import { analyticsErrorResponse, requireInjectedPrincipal, validated } from "./http.helpers";
import type { z } from "@hono/zod-openapi";
import type { queryAnalyticsQuerySchema } from "./analytics.schemas";
import type { MetricType } from "../domain/analytics";

export const SCHEDULER_SECRET_HEADER = "x-analytics-scheduler-secret";

export interface AnalyticsControllerDependencies {
  readonly analyticsService: AnalyticsService;
  readonly schedulerSecret?: string | undefined;
  readonly handleScheduledRefresh?: (() => Promise<{ accepted: boolean; message: string }>) | undefined;
}

type QueryAnalyticsQuery = z.infer<typeof queryAnalyticsQuerySchema>;

export function createAnalyticsController(dependencies: AnalyticsControllerDependencies) {
  return {
    async queryMetrics(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<QueryAnalyticsQuery>(context, "query");
        const logger = context.get("logger");
        const requestId = context.get("requestId");
        logger.debug({ requestId, userId: principal.userId, query }, "analytics query started");

        const result = await dependencies.analyticsService.queryMetrics(principal, {
          metricType: query.metric_type as MetricType | undefined,
          societyId: query.society_id,
          periodStart: query.period_start,
          periodEnd: query.period_end,
          cursor: query.cursor,
          limit: query.limit,
        });

        logger.info({
          requestId,
          userId: principal.userId,
          requestedMetricType: query.metric_type,
          returnedMetricCount: result.metrics.length,
          returnedMetricTypes: [...new Set(result.metrics.map((metric) => metric.metricType))],
          hasMore: result.page.hasMore,
        }, "analytics query completed");
        return context.json(result, 200);
      } catch (error) {
        context.get("logger").warn({
          requestId: context.get("requestId"),
          error: error instanceof Error ? error.message : String(error),
        }, "analytics query failed");
        return analyticsErrorResponse(context, error);
      }
    },

    async refresh(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        context.get("logger").info({
          requestId: context.get("requestId"),
          userId: principal.userId,
        }, "analytics refresh requested");
        const result = await dependencies.analyticsService.refresh(principal);
        context.get("logger").info({
          requestId: context.get("requestId"),
          accepted: result.accepted,
        }, "analytics refresh accepted");
        return context.json(result, 202);
      } catch (error) {
        context.get("logger").warn({
          requestId: context.get("requestId"),
          error: error instanceof Error ? error.message : String(error),
        }, "analytics refresh failed");
        return analyticsErrorResponse(context, error);
      }
    },

    async scheduledRefresh(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const headerError: AppError = new ApplicationError(
          "AUTH_REQUIRED",
          "A valid scheduler secret header is required",
        );
        const presented = context.req.header(SCHEDULER_SECRET_HEADER);
        const expected = dependencies.schedulerSecret;
        if (
          expected === undefined ||
          expected.length === 0 ||
          typeof presented !== "string" ||
          presented.length !== expected.length ||
          !timingSafeEqualStrings(presented, expected)
        ) {
          throw headerError;
        }

        if (dependencies.handleScheduledRefresh === undefined) {
          return context.json(
            {
              accepted: true,
              message:
                "Analytics refresh orchestration is not configured; nothing was started.",
            },
            202,
          );
        }

        context.get("logger").info(
          { requestId: context.get("requestId") },
          "analytics scheduled refresh accepted",
        );
        const result = await dependencies.handleScheduledRefresh();
        return context.json(result, 202);
      } catch (error) {
        context.get("logger").warn({
          requestId: context.get("requestId"),
          error: error instanceof Error ? error.message : String(error),
        }, "analytics scheduled refresh rejected");
        return analyticsErrorResponse(context, error);
      }
    },
  };
}

function timingSafeEqualStrings(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}