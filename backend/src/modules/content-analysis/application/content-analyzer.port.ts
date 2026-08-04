import type {
  AnalysisInvocationResult,
  ContentAnalysisRequest,
} from "./content-analysis.dto";

/**
 * Outbound port for invoking the content-analysis model.
 *
 * Implemented by an infrastructure adapter (see
 * infrastructure/lambda-content-analyzer.ts). The service depends on this
 * interface so it stays framework-agnostic and testable.
 */
export interface ContentAnalyzerPort {
  /**
   * Invoke the analyzer synchronously with a bounded request. Returns the
   * validated result together with correlation metadata for audit evidence.
   * Implementations MUST validate the response shape before returning; the
   * service treats any thrown error as a failed run.
   */
  analyze(request: ContentAnalysisRequest): Promise<AnalysisInvocationResult>;
}
