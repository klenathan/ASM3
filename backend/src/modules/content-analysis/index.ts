/**
 * Content Analysis bounded context.
 *
 * Public surface exposed to the rest of the backend:
 *  - `ContentAnalysisService` (use cases, authorization, orchestration)
 *  - context ports the service consumes (implemented by Discussions,
 *    Moderation, Societies, and Media).
 *
 * Modules must not import another module's controllers, concrete
 * repositories, or tables. See docs/BACKEND_ARCHITECTURE.md.
 */
export * from "./application/content-analysis.dto";

export type {
  ContentAnalysisService,
} from "./application/content-analysis.service";

export type {
  ContentAnalyzerPort,
} from "./application/content-analyzer.port";

export type {
  ThreadAnalysisContextPort,
  ThreadAnalysisContext,
} from "./application/thread-analysis-context.port";

export type {
  ReportAnalysisContextPort,
  ReportAnalysisContext,
} from "./application/report-analysis-context.port";
