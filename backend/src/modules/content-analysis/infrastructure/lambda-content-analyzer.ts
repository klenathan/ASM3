import { Lambda } from "@aws-sdk/client-lambda";
import type { ContentAnalyzerPort } from "../application/content-analyzer.port";
import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "../application/content-analysis.dto";
import { isStrictResult } from "../domain/content-analysis.policy";

/**
 * Infrastructure adapter invoking the analysis Lambda synchronously
 * (RequestResponse). Uses @aws-sdk/client-lambda.
 *
 * The backing function stays outside the VPC and never connects to RDS; it
 * receives the bounded request and returns strict JSON that this adapter
 * validates before handing to the service.
 */
export interface LambdaContentAnalyzerConfig {
  functionName: string;
  qualifier?: string;
  timeoutMs: number;
  region: string;
}

export class LambdaContentAnalyzer implements ContentAnalyzerPort {
  readonly config: LambdaContentAnalyzerConfig;
  private readonly lambda: Lambda;

  constructor(config: LambdaContentAnalyzerConfig) {
    this.config = config;
    this.lambda = new Lambda({ region: config.region });
  }

  async analyze(request: ContentAnalysisRequest): Promise<ContentAnalysisResult> {
    // TODO(phase 2): invoke with RequestResponse, bound timeout below the SQS
    // visibility deadline, surface Lambda function version for audit.
    void request;
    void this.lambda;
    throw new Error("LambdaContentAnalyzer not implemented");
  }
}

// Reuse for validating the response in both adapter and function bundle.
export { isStrictResult };
