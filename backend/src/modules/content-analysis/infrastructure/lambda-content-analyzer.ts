import { InvokeCommand, Lambda } from "@aws-sdk/client-lambda";
import type { Logger } from "pino";
import type { ContentAnalyzerPort } from "../application/content-analyzer.port";
import type {
  AnalysisInvocationResult,
  ContentAnalysisRequest,
} from "../application/content-analysis.dto";
import { isStrictResult, strictResultIssue } from "../domain/content-analysis.policy";

/**
 * Infrastructure adapter invoking the analysis Lambda synchronously
 * (RequestResponse). Uses @aws-sdk/client-lambda.
 *
 * The backing function stays outside the VPC and never connects to RDS; it
 * receives the bounded request and returns strict JSON that this adapter
 * validates before handing to the service. Timeout is bounded below the SQS
 * visibility deadline so the backend retains ownership while a run executes.
 */
export interface LambdaContentAnalyzerConfig {
  functionName: string;
  qualifier?: string;
  timeoutMs: number;
  region: string;
  logger?: Logger;
}

export class LambdaContentAnalyzer implements ContentAnalyzerPort {
  readonly config: LambdaContentAnalyzerConfig;
  private readonly lambda: Lambda;

  constructor(config: LambdaContentAnalyzerConfig) {
    this.config = config;
    this.lambda = new Lambda({ region: config.region });
  }

  async analyze(request: ContentAnalysisRequest): Promise<AnalysisInvocationResult> {
    this.config.logger?.info(
      { functionName: this.config.functionName, qualifier: this.config.qualifier },
      "invoking content-analysis lambda",
    );
    const response = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.config.functionName,
        Qualifier: this.config.qualifier,
        InvocationType: "RequestResponse",
        LogType: "None",
        Payload: new TextEncoder().encode(
          JSON.stringify({ request }),
        ),
      }),
      { abortSignal: AbortSignal.timeout(this.config.timeoutMs) },
    );

    const statusCode = response.StatusCode ?? 0;
    if (statusCode !== 200) {
      throw new Error(`content-analysis lambda returned HTTP ${statusCode}`);
    }
    if (response.FunctionError) {
      throw new Error(`content-analysis lambda function error: ${response.FunctionError}`);
    }

    const payload = response.Payload;
    const raw = ArrayBuffer.isView(payload)
      ? new TextDecoder().decode(payload)
      : typeof response.Payload === "string"
        ? response.Payload
        : null;
    if (raw === null) {
      throw new Error("content-analysis lambda returned no payload");
    }

    this.config.logger?.info(
      {
        lambdaFunctionVersion: response.ExecutedVersion ?? null,
        lambdaRequestId: response.$metadata?.requestId ?? null,
      },
      "content-analysis lambda invoked successfully",
    );

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error("content-analysis lambda returned invalid JSON payload");
    }

    // The function returns the strict ContentAnalysisResult directly.
    if (!isStrictResult(body)) {
      throw new Error(
        `content-analysis lambda returned schema-invalid analysis: ${strictResultIssue(body)}`,
      );
    }

    return {
      result: body,
      modelId: null,
      lambdaFunctionVersion: response.ExecutedVersion ?? null,
      lambdaRequestId: response.$metadata?.requestId ?? null,
      providerRequestId: null,
    };
  }
}

// Reuse for validating the response in both adapter and function bundle.
export { isStrictResult };
