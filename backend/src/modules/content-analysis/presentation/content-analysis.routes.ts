import type { Hono } from "hono";
import type { ContentAnalysisController } from "./content-analysis.controller";

/**
 * Suggested endpoints (plan section 9). Route guards never replace service
 * authorization.
 *   GET  /threads/:threadId/analysis-status
 *   GET  /mod/reports/:reportId/analysis
 *   POST /mod/reports/:reportId/reanalyze
 */
export function registerContentAnalysisRoutes(
  app: Hono,
  controller: ContentAnalysisController,
): void {
  void app;
  void controller;
  // TODO(phase 4): mount routes under /api/v1 with auth middleware.
}
