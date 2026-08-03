/**
 * Lambda composition root. Imports AWS SDK adapters but MUST NOT contain
 * moderation policy, database access, or business rules. Reads config from
 * environment, validates requests, calls OpenRouter, returns result.
 */
import { OpenRouterContentAnalyzer } from "./openrouter-content-analyzer";
import type { LambdaEvent } from "./contracts";

export interface HandlerConfig {
  modelId: string;
  region: string;
  baseUrl: string;
  apiKeySecretArn: string | undefined;
  apiKey: string | undefined;
  requestTimeoutMs: number;
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
    modelId: env.OPENROUTER_MODEL,
    allowedMediaBucket: env.ALLOWED_MEDIA_BUCKET,
    allowedMediaPrefix: env.ALLOWED_MEDIA_PREFIX,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing required env: ${key}`);
  }
  return {
    modelId: required.modelId!,
    region: env.AWS_REGION ?? "us-east-1",
    baseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKeySecretArn: env.OPENROUTER_API_KEY_SECRET_ARN,
    apiKey: env.OPENROUTER_API_KEY,
    requestTimeoutMs: Number(env.OPENROUTER_TIMEOUT_MS ?? 50_000),
    allowedMediaBucket: required.allowedMediaBucket!,
    allowedMediaPrefix: required.allowedMediaPrefix!,
    maxModelTokens: Number(env.MAX_MODEL_TOKENS ?? 2048),
    maxImageBytes: Number(env.MAX_IMAGE_BYTES ?? 5 * 1024 * 1024),
    maxTotalBytes: Number(env.MAX_TOTAL_IMAGE_BYTES ?? 10 * 1024 * 1024),
    maxImages: Number(env.MAX_IMAGES ?? 4),
    allowedMimeTypes: (env.ALLOWED_MIME_TYPES ?? "image/jpeg,image/png,image/webp")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

let analyzer: OpenRouterContentAnalyzer | null = null;

export function handler(
  event: LambdaEvent,
  _context: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  // Fail closed at startup if required settings are missing or invalid.
  const config = loadConfig(env);
  if (!config.apiKeySecretArn && !config.apiKey) {
    throw new Error("missing required env: OPENROUTER_API_KEY_SECRET_ARN");
  }
  if (!analyzer) {
    analyzer = new OpenRouterContentAnalyzer(
      {
        modelId: config.modelId,
        region: config.region,
        baseUrl: config.baseUrl,
        apiKeySecretArn: config.apiKeySecretArn,
        apiKey: config.apiKey,
        maxModelTokens: config.maxModelTokens,
        requestTimeoutMs: config.requestTimeoutMs,
      },
      {
        allowedBucket: config.allowedMediaBucket,
        allowedPrefix: config.allowedMediaPrefix,
        maxImageBytes: config.maxImageBytes,
        maxTotalBytes: config.maxTotalBytes,
        maxImages: config.maxImages,
        allowedMimeTypes: config.allowedMimeTypes,
      },
    );
  }
  return analyzer.analyze(event.request);
}
