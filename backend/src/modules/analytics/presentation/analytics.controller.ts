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

        const result = await dependencies.analyticsService.queryMetrics(principal, {
          metricType: query.metric_type as MetricType | undefined,
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

    async refresh(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.analyticsService.refresh(principal);
        return context.json(result, 202);
      } catch (error) {
        return analyticsErrorResponse(context, error);
      }
    },
  };
}