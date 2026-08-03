/**
 * Controller: transport concerns only. Delegates to ContentAnalysisService;
 * no business rules, authorization decisions, transactions, or Drizzle here.
 */
import type { Context } from "hono";
import type { ContentAnalysisService } from "../application/content-analysis.service";

export class ContentAnalysisController {
  readonly service: ContentAnalysisService;

  constructor(service: ContentAnalysisService) {
    this.service = service;
  }

  async getThreadAnalysisStatus(c: Context) {
    // TODO(phase 4): thread author limited status / user-safe summary.
    void c;
    throw new Error("not implemented");
  }

  async getReportAnalysis(c: Context) {
    // TODO(phase 4): moderator/system-admin full analysis.
    void c;
    throw new Error("not implemented");
  }

  async reanalyzeReport(c: Context) {
    // TODO(phase 4): explicit moderator-triggered reanalysis.
    void c;
    throw new Error("not implemented");
  }
}
