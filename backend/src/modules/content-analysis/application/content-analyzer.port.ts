import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "./content-analysis.dto";

/**
 * Outbound port for invoking the content-analysis model.
 *
 * Implemented by an infrastructure adapter (see
 * infrastructure/lambda-content-analyzer.ts). The service depends on this
 * interface so it stays framework-agnostic and testable.
 */
export interface ContentAnalyzerPort {
  analyze(request: ContentAnalysisRequest): Promise<ContentAnalysisResult>;
}
