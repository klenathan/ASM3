/**
 * Orchestrates content analysis. Owns authorization, context rehydration,
 * invocation, result validation, and transactional persistence. Kept
 * framework-agnostic; inject dependencies explicitly.
 */
import type { ContentAnalyzerPort } from "./content-analyzer.port";
import type { ThreadAnalysisContextPort } from "./thread-analysis-context.port";
import type { ReportAnalysisContextPort } from "./report-analysis-context.port";
import type { ContentAnalysisRepository } from "./content-analysis.repository";

export interface ContentAnalysisServiceDeps {
  repository: ContentAnalysisRepository;
  analyzer: ContentAnalyzerPort;
  threadContext: ThreadAnalysisContextPort;
  reportContext: ReportAnalysisContextPort;
}

export class ContentAnalysisService {
  readonly deps: ContentAnalysisServiceDeps;

  constructor(deps: ContentAnalysisServiceDeps) {
    this.deps = deps;
  }

  async analyzeNewThread(threadId: string): Promise<void> {
    // TODO(phase 2): rehydrate thread context, invoke analyzer, apply result
    // transactionally (publish pending in enforce mode).
    void threadId;
    void this.deps.threadContext;
    void this.deps.analyzer;
  }
}
