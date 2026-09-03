import type { Context } from "hono";
import { ApplicationError } from "../../../shared/domain/errors";

import type { AppEnvironment } from "../../../app-types";
import type { AnalyticsService } from "../application/analytics.service";
import { analyticsErrorResponse, requireInjectedPrincipal, validated } from "./http.helpers";
import type { z } from "@hono/zod-openapi";
import type {
  actionAnalyticsQuerySchema,
  queryAnalyticsQuerySchema,
  refreshRangeSchema,
} from "./analytics.schemas";
import type { MetricType } from "../domain/analytics";

export const SCHEDULER_SECRET_HEADER = "x-analytics-scheduler-secret";

export interface AnalyticsControllerDependencies {
  readonly analyticsService: AnalyticsService;
}

type QueryAnalyticsQuery = z.infer<typeof queryAnalyticsQuerySchema>;
type ActionAnalyticsQuery = z.infer<typeof actionAnalyticsQuerySchema>;
type RefreshRangeInput = z.infer<typeof refreshRangeSchema>;

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
    async refreshStatus(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.analyticsService.refreshStatus(principal);
        return context.json(result, 200);
      } catch (error) {
        context.get("logger").warn({
          requestId: context.get("requestId"),
          error: error instanceof Error ? error.message : String(error),
        }, "analytics refresh status failed");
        return analyticsErrorResponse(context, error);
      }
    },

    async scheduledRefresh(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const presented = context.req.header(SCHEDULER_SECRET_HEADER);
        const result = await dependencies.analyticsService.scheduledRefresh(presented);
        context.get("logger").info(
          { requestId: context.get("requestId") },
          "analytics scheduled refresh accepted",
        );
        return context.json(result, 202);
      } catch (error) {
        context.get("logger").warn({
          requestId: context.get("requestId"),
          error: error instanceof Error ? error.message : String(error),
        }, "analytics scheduled refresh rejected");
        return analyticsErrorResponse(context, error);
      }
    },
    async queryActionMetrics(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<ActionAnalyticsQuery>(context, "query");
        const result = await dependencies.analyticsService.queryActionMetrics(principal, {
          ...(query.grain === undefined ? {} : { grain: query.grain }),
          ...(query.society_id === undefined ? {} : { societyId: query.society_id }),
          ...(query.target_type === undefined ? {} : { targetType: query.target_type }),
          ...(query.target_id === undefined ? {} : { targetId: query.target_id }),
          ...(query.period_start === undefined ? {} : { periodStart: new Date(`${query.period_start}T00:00:00.000Z`) }),
          ...(query.period_end === undefined ? {} : { periodEnd: new Date(`${query.period_end}T00:00:00.000Z`) }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.limit === undefined ? {} : { limit: query.limit }),
        });
        return context.json(result, 200);
      } catch (error) {
        return analyticsErrorResponse(context, error);
      }
    },

    async refreshV2(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const range = validated<RefreshRangeInput>(context, "json");
        const result = await dependencies.analyticsService.refresh(principal, range);
        return context.json(result, 202);
      } catch (error) {
        return analyticsErrorResponse(context, error);
      }
    },

    async refreshStatusById(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { runId } = context.req.param();
        if (runId === undefined) throw new ApplicationError("VALIDATION_ERROR", "runId is required");
        const result = await dependencies.analyticsService.actionRefreshStatus(principal, runId);
        return context.json(result, 200);
      } catch (error) {
        return analyticsErrorResponse(context, error);
      }
    },

    async historicalBaseline(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<QueryAnalyticsQuery>(context, "query");
        const result = await dependencies.analyticsService.historicalBaseline(principal, {
          metricType: query.metric_type,
          societyId: query.society_id,
          periodStart: query.period_start,
          periodEnd: query.period_end,
          cursor: query.cursor,
          limit: query.limit,
        });
        return context.json(result, 200);
      } catch (error) {
        return analyticsErrorResponse(context, error);
      }
    },
  };
}
