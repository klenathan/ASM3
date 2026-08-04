/**
 * Content Analysis bounded context.
 *
 * Public surface exposed to the rest of the backend:
 *  - `ContentAnalysisService` (use cases, authorization, orchestration)
 *  - infrastructure adapters used at the composition root
 *  - context ports the service consumes (implemented by Discussions,
 *    Moderation, Societies, and Media).
 *
 * Modules must not import another module's controllers, concrete
 * repositories, or tables. See docs/BACKEND_ARCHITECTURE.md.
 */
export * from "./application/content-analysis.dto";

export {
  ContentAnalysisService,
  type ContentAnalysisServiceDeps,
  type ContentAnalysisMode,
} from "./application/content-analysis.service";

export type {
  ContentAnalyzerPort,
} from "./application/content-analyzer.port";

export type {
  ContentAnalysisRepository,
  RecordRunResultInput,
  RecordRunFailureInput,
} from "./application/content-analysis.repository";

export type {
  ThreadAnalysisContextPort,
  ThreadAnalysisContext,
} from "./application/thread-analysis-context.port";

export type {
  ReportAnalysisContextPort,
  ReportAnalysisContext,
} from "./application/report-analysis-context.port";

export {
  ReanalysisWorker,
  type ReanalysisRunner,
  type ReanalysisWorkerDependencies,
} from "./application/reanalysis.worker";

export type {
  ReanalysisJob,
  ReanalysisJobPublisher,
  ReanalysisMessage,
  ReanalysisMessageSource,
} from "./application/reanalysis-queue.port";

export {
  DrizzleContentAnalysisRepository,
} from "./infrastructure/drizzle-content-analysis.repository";

export type {
  AnalysisOverrideDecision,
  ContentAnalysisOverride,
} from "./domain/content-analysis";

export {
  LambdaContentAnalyzer,
  type LambdaContentAnalyzerConfig,
} from "./infrastructure/lambda-content-analyzer";

export {
  ThreadAnalysisContextAdapter,
  type ThreadAnalysisContextDeps,
  type ThreadAnalysisContextThread,
  type ThreadAnalysisContextAsset,
  type ThreadAnalysisContextRule,
} from "./infrastructure/thread-analysis-context";

export {
  SqsReanalysisJobPublisher,
  SqsReanalysisMessageSource,
  type SqsReanalysisQueueOptions,
} from "./infrastructure/reanalysis.sqs";
