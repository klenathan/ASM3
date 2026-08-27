import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { AnalyticsService } from "../application/analytics.service";
import { analyticsErrorResponse, requireInjectedPrincipal, validated } from "./http.helpers";
import type { z } from "@hono/zod-openapi";
import type { queryAnalyticsQuerySchema } from "./analytics.schemas";
import type { MetricType } from "../domain/analytics";

export interface AnalyticsControllerDependencies {
  readonly analyticsService: AnalyticsService;
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
  };
}