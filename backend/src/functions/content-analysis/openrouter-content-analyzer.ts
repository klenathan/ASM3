/**
 * OpenRouter adapter used inside the Lambda function. Retrieves approved
 * images from private S3, then calls the configured DeepSeek model through the
 * OpenAI-compatible chat completions API.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { buildPrompt } from "./prompt";
import type { ContentAnalysisRequest, ContentAnalysisResult } from "./contracts";
import type { Logger } from "./logger";

export interface OpenRouterConfig {
  modelId: string;
  region: string;
  baseUrl: string;
  apiKeySecretArn: string | undefined;
  apiKey: string | undefined;
  maxModelTokens: number;
  requestTimeoutMs: number;
}

export interface ImageBounds {
  allowedBucket: string;
  allowedPrefix: string;
  maxImageBytes: number;
  maxTotalBytes: number;
  maxImages: number;
  allowedMimeTypes: string[];
}

type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export class OpenRouterContentAnalyzer {
  readonly config: OpenRouterConfig;
  readonly bounds: ImageBounds;
  private readonly secrets: SecretsManagerClient;
  private readonly s3: S3Client;
  private readonly logger: Logger;
  private apiKeyPromise: Promise<string> | null = null;

  constructor(config: OpenRouterConfig, bounds: ImageBounds, logger: Logger) {
    this.config = config;
    this.bounds = bounds;
    this.logger = logger;
    this.secrets = new SecretsManagerClient({ region: config.region });
    this.s3 = new S3Client({ region: config.region });
  }

  async analyze(request: ContentAnalysisRequest): Promise<ContentAnalysisResult> {
    const startedAt = performance.now();
    this.logger.info({ analysisId: request.analysisId, triggerType: request.triggerType }, "content analysis started");
    const apiKey = await this.loadApiKey();
    const imageBlocks = await this.loadImageBlocks(request);
    this.logger.info({ analysisId: request.analysisId, imageCount: imageBlocks.length }, "image blocks loaded");
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(process.env.OPENROUTER_SITE_URL
            ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
            : {}),
          ...(process.env.OPENROUTER_APP_NAME
            ? { "X-Title": process.env.OPENROUTER_APP_NAME }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.modelId,
          messages: [
            {
              role: "system",
              content: buildPrompt(request.globalPolicy, societyRulesText(request)),
            },
            { role: "user", content: this.buildContentBlocks(request, imageBlocks) },
          ],
          max_tokens: this.config.maxModelTokens,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.error({ analysisId: request.analysisId, status: response.status }, "OpenRouter request failed");
      throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("OpenRouter returned invalid JSON");
    }
    const result = this.parseResult(payload);
    const durationMs = Math.round(performance.now() - startedAt);
    this.logger.info(
      { analysisId: request.analysisId, decision: result.decision, durationMs },
      "content analysis completed",
    );
    return result;
  }

  private async loadApiKey(): Promise<string> {
    if (this.config.apiKey) return this.config.apiKey;
    if (!this.config.apiKeySecretArn) {
      throw new Error("OpenRouter API key is not configured");
    }
    if (this.apiKeyPromise) return this.apiKeyPromise;
    const promise = this.secrets
      .send(new GetSecretValueCommand({ SecretId: this.config.apiKeySecretArn }))
      .then((result) => {
        const secret = result.SecretString?.trim();
        if (!secret) throw new Error("OpenRouter API key secret is empty");
        try {
          const parsed = JSON.parse(secret) as { apiKey?: unknown };
          if (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) {
            return parsed.apiKey.trim();
          }
        } catch {
          // A raw secret string is also supported for simple Learner Lab setup.
        }
        return secret;
      });
    this.apiKeyPromise = promise;
    return promise;
  }

  private async loadImageBlocks(request: ContentAnalysisRequest): Promise<OpenRouterContentPart[]> {
    if (request.images.length > this.bounds.maxImages) {
      throw new Error("image count exceeds configured limit");
    }

    let totalBytes = 0;
    const blocks: OpenRouterContentPart[] = [];
    for (const image of request.images) {
      if (
        image.bucket !== this.bounds.allowedBucket ||
        !image.key.startsWith(this.bounds.allowedPrefix)
      ) {
        throw new Error("image object is outside the approved media scope");
      }
      if (!this.bounds.allowedMimeTypes.includes(image.contentType)) {
        throw new Error("image MIME type is not allowed");
      }
      if (image.byteSize > this.bounds.maxImageBytes) {
        throw new Error("image exceeds configured size limit");
      }
      totalBytes += image.byteSize;
      if (totalBytes > this.bounds.maxTotalBytes) {
        throw new Error("total image size exceeds configured limit");
      }

      const obj = await this.s3.send(new GetObjectCommand({
        Bucket: image.bucket,
        Key: image.key,
      }));
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes) throw new Error("empty image object");
      if (bytes.byteLength !== image.byteSize || bytes.byteLength > this.bounds.maxImageBytes) {
        throw new Error("image metadata does not match the stored object");
      }
      if (obj.ContentType && obj.ContentType !== image.contentType) {
        throw new Error("image MIME metadata does not match the approved request");
      }
      blocks.push({
        type: "image_url",
        image_url: {
          url: `data:${image.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
        },
      });
    }
    return blocks;
  }

  private buildContentBlocks(
    request: ContentAnalysisRequest,
    images: OpenRouterContentPart[],
  ): OpenRouterContentPart[] {
    const { content } = request;
    const text = [
      "BEGIN UNTRUSTED CONTENT",
      content.title ? `TITLE:\n${content.title}` : "",
      content.body ? `BODY:\n${content.body}` : "",
      content.reportReason ? `REPORT REASON:\n${content.reportReason}` : "",
      content.reportDetails ? `REPORT DETAILS:\n${content.reportDetails}` : "",
      content.comments.length
        ? `COMMENTS:\n${content.comments.map((comment) => `[${comment.id}] (${comment.score}) ${comment.body}`).join("\n")}`
        : "COMMENTS: none",
      `ENGAGEMENT: upvotes=${request.engagement.upvotes}, downvotes=${request.engagement.downvotes}, net=${request.engagement.netScore}, visibleComments=${request.engagement.visibleCommentCount}, contextTruncated=${request.engagement.contextTruncated}`,
      "END UNTRUSTED CONTENT",
    ]
      .filter(Boolean)
      .join("\n\n");

    return [{ type: "text", text }, ...images];
  }

  private parseResult(response: unknown): ContentAnalysisResult {
    const message = (response as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }).choices?.[0]?.message?.content;
    const text = Array.isArray(message)
      ? message
          .filter((part): part is { text: string } => typeof part?.text === "string")
          .map((part) => part.text)
          .join("\n")
      : message;
    if (typeof text !== "string") throw new Error("OpenRouter response has no message content");

    let result: unknown;
    try {
      result = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
    } catch {
      this.logger.error("OpenRouter returned malformed analysis JSON");
      throw new Error("OpenRouter returned malformed analysis JSON");
    }
    if (!isStrictResult(result)) throw new Error("OpenRouter returned schema-invalid analysis");
    return result;
  }
}

function isStrictResult(value: unknown): value is ContentAnalysisResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  const sentiment = result.sentiment as Record<string, unknown> | undefined;
  if (result.decision !== "allow" && result.decision !== "review") return false;
  if (
    !sentiment ||
    !["positive", "neutral", "negative", "mixed"].includes(sentiment.label as string) ||
    typeof sentiment.confidence !== "number" ||
    sentiment.confidence < 0 ||
    sentiment.confidence > 1
  ) {
    return false;
  }
  if (!Array.isArray(result.findings) || typeof result.summary !== "string") return false;
  return result.findings.every((finding) => {
    if (typeof finding !== "object" || finding === null) return false;
    const item = finding as Record<string, unknown>;
    return (
      typeof item.category === "string" &&
      ["low", "medium", "high"].includes(item.severity as string) &&
      typeof item.confidence === "number" &&
      item.confidence >= 0 &&
      item.confidence <= 1 &&
      ["title", "body", "image", "comment"].includes(item.source as string) &&
      typeof item.evidence === "string"
    );
  });
}

function societyRulesText(request: ContentAnalysisRequest): string {
  return request.societyRules.map((r) => `- ${r.title}: ${r.description}`).join("\n");
}
