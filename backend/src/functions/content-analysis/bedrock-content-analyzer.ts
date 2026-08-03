/**
 * Bedrock Runtime adapter used inside the Lambda function. Retrieves approved
 * images from private S3, then calls the multimodal model via the Converse API.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { buildPrompt } from "./prompt";
import type { ContentAnalysisRequest, ContentAnalysisResult } from "./contracts";

export interface BedrockConfig {
  modelId: string;
  region: string;
  maxModelTokens: number;
}

export interface ImageBounds {
  allowedPrefix: string;
  maxImageBytes: number;
  maxTotalBytes: number;
  maxImages: number;
  allowedMimeTypes: string[];
}

export class BedrockContentAnalyzer {
  readonly config: BedrockConfig;
  readonly bounds: ImageBounds;
  private readonly bedrock: BedrockRuntimeClient;
  private readonly s3: S3Client;

  constructor(config: BedrockConfig, bounds: ImageBounds) {
    this.config = config;
    this.bounds = bounds;
    this.bedrock = new BedrockRuntimeClient({ region: config.region });
    this.s3 = new S3Client({ region: config.region });
  }

  async analyze(request: ContentAnalysisRequest): Promise<ContentAnalysisResult> {
    // TODO(phase 2): validate bucket/prefix/MIME/size limits before retrieval.
    const imageBlocks = await this.loadImageBlocks(request);
    const response = await this.bedrock.send(new ConverseCommand({
      modelId: this.config.modelId,
      system: [{ text: buildPrompt(request.globalPolicy, societyRulesText(request)) }],
      messages: [{ role: "user", content: this.buildContentBlocks(request, imageBlocks) }],
      inferenceConfig: { maxTokens: this.config.maxModelTokens },
    }));
    return this.parseResult(response);
  }

  private async loadImageBlocks(request: ContentAnalysisRequest) {
    const blocks: ContentBlock[] = [];
    for (const image of request.images) {
      const obj = await this.s3.send(new GetObjectCommand({
        Bucket: image.bucket,
        Key: image.key,
      }));
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes) throw new Error("empty image object");
      blocks.push({ image: { format: this.mimeToFormat(image.contentType), source: { bytes } } });
    }
    return blocks;
  }

  private buildContentBlocks(_request: ContentAnalysisRequest, images: ContentBlock[]): ContentBlock[] {
    // TODO(phase 2): serialize text context and append image blocks.
    return images;
  }

  private mimeToFormat(mime: string): "jpeg" | "png" | "gif" | "webp" {
    switch (mime) {
      case "image/png": return "png";
      case "image/gif": return "gif";
      case "image/webp": return "webp";
      default: return "jpeg";
    }
  }

  private parseResult(_response: unknown): ContentAnalysisResult {
    // TODO(phase 2): parse strict JSON from the assistant message and validate.
    throw new Error("not implemented");
  }
}

function societyRulesText(request: ContentAnalysisRequest): string {
  return request.societyRules.map((r) => `- ${r.title}: ${r.description}`).join("\n");
}
