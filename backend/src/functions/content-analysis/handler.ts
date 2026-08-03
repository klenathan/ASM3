/**
 * Lambda composition root. Imports AWS SDK adapters but MUST NOT contain
 * moderation policy, database access, or business rules. Reads config from
 * environment, validates requests, calls Bedrock, returns result.
 */
import { BedrockContentAnalyzer } from "./bedrock-content-analyzer";
import type { LambdaEvent } from "./contracts";

export interface HandlerConfig {
  modelId: string;
  region: string;
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
    modelId: env.BEDROCK_MODEL_ID,
    allowedMediaBucket: env.ALLOWED_MEDIA_BUCKET,
    allowedMediaPrefix: env.ALLOWED_MEDIA_PREFIX,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing required env: ${key}`);
  }
  return {
    modelId: required.modelId!,
    region: env.AWS_REGION ?? "us-east-1",
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

let analyzer: BedrockContentAnalyzer | null = null;

export function handler(
  event: LambdaEvent,
  _context: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  // Fail closed at startup if required settings are missing or invalid.
  const config = loadConfig(env);
  if (!analyzer) {
    analyzer = new BedrockContentAnalyzer(
      {
        modelId: config.modelId,
        region: config.region,
        maxModelTokens: config.maxModelTokens,
      },
      {
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
