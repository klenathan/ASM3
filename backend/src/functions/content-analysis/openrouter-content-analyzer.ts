/**
 * OpenRouter adapter used inside the Lambda function. Retrieves approved
 * images from private S3, then calls the configured DeepSeek model through the
 * OpenAI-compatible chat completions API.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  deadlineMs: number;
  imageUrlExpiresInSeconds: number;
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

class OpenRouterHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenRouter request failed with HTTP ${status}`);
    this.name = "OpenRouterHttpError";
    this.status = status;
  }
}

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
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    this.logger.info(
      {
        analysisId: request.analysisId,
        modelId: this.config.modelId,
        requestTimeoutMs: this.config.requestTimeoutMs,
      },
      "invoking OpenRouter chat completions",
    );
    const deadlineAt = performance.now() + this.config.deadlineMs;

    try {
      return await this.requestAnalysis(
        request,
        imageBlocks,
        url,
        apiKey,
        startedAt,
        deadlineAt,
      );
    } catch (error) {
      if (!(error instanceof OpenRouterHttpError) || error.status !== 413 || imageBlocks.length < 2) {
        throw error;
      }

      // Some vision providers apply a smaller effective limit after fetching
      // remote images. Retry one image at a time so a valid three-image post
      // is not left pending just because the combined request was too large.
      this.logger.warn(
        { analysisId: request.analysisId, imageCount: imageBlocks.length },
        "OpenRouter rejected combined image payload; retrying images individually",
      );
      const results = [];
      for (const image of imageBlocks) {
        results.push(
          await this.requestAnalysis(
            request,
            [image],
            url,
            apiKey,
            startedAt,
            deadlineAt,
          ),
        );
      }
      return mergeImageResults(results);
    }
  }

  private async requestAnalysis(
    request: ContentAnalysisRequest,
    imageBlocks: OpenRouterContentPart[],
    url: string,
    apiKey: string,
    startedAt: number,
    deadlineAt: number,
  ): Promise<ContentAnalysisResult> {
    for (let attempt = 0; ; attempt += 1) {
      const attemptStartedAt = performance.now();
      const remainingMs = deadlineAt - performance.now();
      if (remainingMs <= 0) {
        throw new Error(
          "OpenRouter request deadline exceeded before an attempt could start",
        );
      }
      // Do not let a single token-producing attempt outlive the Lambda so a
      // retried call can still fit inside its configured timeout.
      const attemptTimeoutMs = Math.min(
        this.config.requestTimeoutMs,
        remainingMs,
      );

      let response: Response;
      try {
        response = await fetch(url, {
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
          signal: AbortSignal.timeout(attemptTimeoutMs),
        });
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - attemptStartedAt);
        this.logger.error(
          {
            analysisId: request.analysisId,
            attempt,
            attemptTimeoutMs,
            elapsedMs,
            err: error,
          },
          "OpenRouter request aborted or failed",
        );
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new Error(
            `OpenRouter request timed out after ${attemptTimeoutMs}ms`,
          );
        }
        throw error;
      }
      const fetchElapsedMs = Math.round(performance.now() - attemptStartedAt);
      this.logger.info(
        {
          analysisId: request.analysisId,
          attempt,
          status: response.status,
          fetchElapsedMs,
        },
        "OpenRouter responded",
      );

      const responseText = await response.text();
      if (response.ok) {
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

      // Transient upstream failures (rate limits and 5xx) are retried with
      // exponential backoff and jitter. 429 honors Retry-After when present.
      if (attempt >= this.config.maxRetries || !this.isRetryableStatus(response.status)) {
        this.logger.error(
          {
            analysisId: request.analysisId,
            attempt,
            status: response.status,
            maxRetries: this.config.maxRetries,
          },
          "OpenRouter request failed",
        );
        throw new OpenRouterHttpError(response.status);
      }

      const retryAfter = response.headers.get("retry-after");
      const delayMs = this.retryDelayMs(response.status, retryAfter, attempt);
      const nowMs = performance.now();
      if (nowMs + delayMs >= deadlineAt) {
        this.logger.error(
          {
            analysisId: request.analysisId,
            attempt,
            status: response.status,
            reason: "no remaining budget for retry",
          },
          "OpenRouter request failed",
        );
        throw new OpenRouterHttpError(response.status);
      }
      this.logger.warn(
        {
          analysisId: request.analysisId,
          attempt,
          status: response.status,
          retryAfter,
          delayMs,
          nextAttempt: attempt + 1,
        },
        "OpenRouter rate limit/5xx; retrying",
      );
      await this.sleep(delayMs);
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private retryDelayMs(
    status: number,
    retryAfter: string | null,
    attempt: number,
  ): number {
    if (status === 429 && retryAfter !== null) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return Math.min(this.config.retryMaxDelayMs, seconds * 1000);
      }
    }
    const jitter = Math.floor(Math.random() * this.config.retryBaseDelayMs);
    const backoff = Math.min(
      this.config.retryMaxDelayMs,
      this.config.retryBaseDelayMs * 2 ** attempt,
    );
    return backoff + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      const obj = await this.s3.send(new HeadObjectCommand({
        Bucket: image.bucket,
        Key: image.key,
      }));
      if (obj.ContentLength !== image.byteSize || image.byteSize > this.bounds.maxImageBytes) {
        throw new Error("image metadata does not match the stored object");
      }
      if (obj.ContentType && obj.ContentType !== image.contentType) {
        throw new Error("image MIME metadata does not match the approved request");
      }
      // Keep image bytes out of the OpenRouter JSON body. The provider fetches
      // this short-lived URL directly from S3 instead of receiving base64 data.
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: image.bucket,
          Key: image.key,
        }),
        { expiresIn: this.config.imageUrlExpiresInSeconds },
      );
      blocks.push({
        type: "image_url",
        image_url: {
          url,
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
    if (!isStrictResult(result)) {
      throw new Error(`OpenRouter returned schema-invalid analysis: ${strictResultIssue(result)}`);
    }
    return result;
  }
}

function mergeImageResults(results: ContentAnalysisResult[]): ContentAnalysisResult {
  const first = results[0];
  if (!first) throw new Error("No image analysis results to merge");
  const sentiment = results.reduce((best, result) =>
    result.sentiment.confidence > best.confidence ? result.sentiment : best,
    first.sentiment,
  );

  return {
    decision: results.some((result) => result.decision === "review") ? "review" : "allow",
    sentiment,
    findings: results.flatMap((result) => result.findings),
    summary: results.map((result) => result.summary).join(" "),
    rationale: results.map((result) => result.rationale).join(" "),
  };
}

export function strictResultIssue(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "result is not an object";
  }
  const r = value as Record<string, unknown>;

  if (r.decision !== "allow" && r.decision !== "review") {
    return `invalid decision ${JSON.stringify(r.decision)} (expected "allow"|"review")`;
  }
  if (typeof r.summary !== "string" || r.summary.length === 0) {
    return "summary is missing or empty";
  }
  if (typeof r.rationale !== "string" || r.rationale.length === 0) {
    return "rationale is missing or empty";
  }

  const s = r.sentiment as Record<string, unknown> | undefined;
  if (!s) {
    return "sentiment is missing";
  }
  if (!["positive", "neutral", "negative", "mixed"].includes(s.label as string)) {
    return `invalid sentiment label ${JSON.stringify(s.label)}`;
  }
  if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1) {
    return `sentiment confidence out of range [0,1] (${JSON.stringify(s.confidence)})`;
  }

  if (!Array.isArray(r.findings)) {
    return "findings is not an array";
  }
  const findings = r.findings as Array<Record<string, unknown>>;
  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i];
    if (typeof f !== "object" || f === null) {
      return `findings[${i}] is not an object`;
    }
    if (typeof f.category !== "string" || f.category.length === 0) {
      return `findings[${i}].category is missing or empty`;
    }
    if (!["low", "medium", "high"].includes(f.severity as string)) {
      return `findings[${i}] has invalid severity ${JSON.stringify(f.severity)}`;
    }
    if (typeof f.confidence !== "number" || f.confidence < 0 || f.confidence > 1) {
      return `findings[${i}].confidence out of range [0,1] (${JSON.stringify(f.confidence)})`;
    }
    if (!["title", "body", "image", "comment"].includes(f.source as string)) {
      return `findings[${i}] has invalid source ${JSON.stringify(f.source)}`;
    }
    if (typeof f.evidence !== "string" || f.evidence.length === 0) {
      return `findings[${i}].evidence is missing or empty`;
    }
  }

  return null;
}

// Must stay identical to the backend's strict validator so the Lambda cannot
// emit output that the backend (modules/content-analysis/domain/
// content-analysis.policy.ts) later rejects. Mirror it here because the
// function bundle is self-contained and cannot import backend source.
export function isStrictResult(value: unknown): value is ContentAnalysisResult {
  return strictResultIssue(value) === null;
}

function societyRulesText(request: ContentAnalysisRequest): string {
  return request.societyRules.map((r) => `- ${r.title}: ${r.description}`).join("\n");
}
