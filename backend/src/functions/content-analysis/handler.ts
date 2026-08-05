/**
 * Lambda composition root. Imports AWS SDK adapters but MUST NOT contain
 * moderation policy, database access, or business rules. Reads config from
 * environment, validates requests, calls OpenRouter, returns result.
 */
import { OpenRouterContentAnalyzer } from "./openrouter-content-analyzer";
import type { LambdaEvent } from "./contracts";
import { createLambdaLogger, type Logger } from "./logger";

export interface HandlerConfig {
  modelId: string;
  region: string;
  baseUrl: string;
  apiKeySecretArn: string | undefined;
  apiKey: string | undefined;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  deadlineMs: number;
  allowedMediaBucket: string;
  allowedMediaPrefix: string;
  maxModelTokens: number;
  maxImageBytes: number;
  maxTotalBytes: number;
  maxImages: number;
  allowedMimeTypes: string[];
}

function loadConfig(env: Record<string, string | undefined>): HandlerConfig {
  const required = {
    OPENROUTER_MODEL: env.OPENROUTER_MODEL,
    ALLOWED_MEDIA_BUCKET: env.ALLOWED_MEDIA_BUCKET,
    ALLOWED_MEDIA_PREFIX: env.ALLOWED_MEDIA_PREFIX,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing required env: ${key}`);
  }
  return {
    modelId: required.OPENROUTER_MODEL!,
    region: env.AWS_REGION ?? "us-east-1",
    baseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKeySecretArn: env.OPENROUTER_API_KEY_SECRET_ARN,
    apiKey: env.OPENROUTER_API_KEY,
    requestTimeoutMs: Number(env.OPENROUTER_TIMEOUT_MS ?? 170_000),
    maxRetries: Number(env.OPENROUTER_MAX_RETRIES ?? 2),
    retryBaseDelayMs: Number(env.OPENROUTER_RETRY_BASE_DELAY_MS ?? 1_000),
    retryMaxDelayMs: Number(env.OPENROUTER_RETRY_MAX_DELAY_MS ?? 8_000),
    // Must stay below the Lambda function timeout so a retried OpenRouter
    // call can still complete inside its configured runtime.
    deadlineMs: Number(env.OPENROUTER_DEADLINE_MS ?? 175_000),
    allowedMediaBucket: required.ALLOWED_MEDIA_BUCKET!,
    allowedMediaPrefix: required.ALLOWED_MEDIA_PREFIX!,
    maxModelTokens: Number(env.MAX_MODEL_TOKENS ?? 2048),
    // 10 MB matches the FE upload and backend media policy limits; keep in
    // sync with web society-thread-composer.tsx and media domain policy.
    maxImageBytes: Number(env.MAX_IMAGE_BYTES ?? 10 * 1024 * 1024),
    maxTotalBytes: Number(env.MAX_TOTAL_IMAGE_BYTES ?? 40 * 1024 * 1024),
    maxImages: Number(env.MAX_IMAGES ?? 4),
    allowedMimeTypes: (
      env.ALLOWED_MIME_TYPES ?? "image/jpeg,image/png,image/webp"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

type Analyzer = Pick<OpenRouterContentAnalyzer, "analyze">;
type AnalyzerFactory = (config: HandlerConfig, logger: Logger) => Analyzer;

function createAnalyzer(config: HandlerConfig, logger: Logger): Analyzer {
  return new OpenRouterContentAnalyzer(
    {
      modelId: config.modelId,
      region: config.region,
      baseUrl: config.baseUrl,
      apiKeySecretArn: config.apiKeySecretArn,
      apiKey: config.apiKey,
      maxModelTokens: config.maxModelTokens,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
      deadlineMs: config.deadlineMs,
    },
    {
      allowedBucket: config.allowedMediaBucket,
      allowedPrefix: config.allowedMediaPrefix,
      maxImageBytes: config.maxImageBytes,
      maxTotalBytes: config.maxTotalBytes,
      maxImages: config.maxImages,
      allowedMimeTypes: config.allowedMimeTypes,
    },
    logger,
  );
}

type RuntimeHandler = (
  event: LambdaEvent,
  context: unknown,
  callback?: unknown,
) => Promise<unknown>;

export function createHandler(
  env: Record<string, string | undefined>,
  analyzerFactory: AnalyzerFactory = createAnalyzer,
  logger: Logger | undefined = undefined,
): RuntimeHandler {
  let analyzer: Analyzer | null = null;
  const activeLogger = logger ?? createLambdaLogger(env);

  return function handle(
    event: LambdaEvent,
    _context: unknown,
    _callback?: unknown,
  ): Promise<unknown> {
    const startedAt = performance.now();
    activeLogger.info(
      {
        analysisId: event.request.analysisId,
        triggerType: event.request.triggerType,
      },
      "Lambda invocation received",
    );
    return Promise.resolve()
      .then(() => {
        // Lambda supplies callback as argument three. Environment comes only
        // from this composition root, never from runtime handler arguments.
        const config = loadConfig(env);
        if (!config.apiKeySecretArn && !config.apiKey) {
          throw new Error(
            "missing required env: OPENROUTER_API_KEY_SECRET_ARN",
          );
        }
        if (analyzer === null) {
          activeLogger.info(
            {
              modelId: config.modelId,
              requestTimeoutMs: config.requestTimeoutMs,
              maxModelTokens: config.maxModelTokens,
              allowedMediaBucket: config.allowedMediaBucket,
              maxImages: config.maxImages,
            },
            "content-analysis Lambda configured",
          );
        }
        analyzer ??= analyzerFactory(config, activeLogger);
        return analyzer.analyze(event.request);
      })
      .then((result) => {
        activeLogger.info(
          {
            analysisId: event.request.analysisId,
            decision: result.decision,
            durationMs: Math.round(performance.now() - startedAt),
            rawResult: result,
          },
          "Lambda invocation completed",
        );
        return result;
      })
      .catch((error: unknown) => {
        activeLogger.error(
          { analysisId: event.request.analysisId, err: error },
          "Lambda invocation failed",
        );
        throw error;
      });
  };
}

export const handler = createHandler(process.env);
