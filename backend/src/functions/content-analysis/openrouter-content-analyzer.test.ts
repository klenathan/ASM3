import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send() {
      return { ContentLength: 1, ContentType: "image/jpeg" };
    }
  },
  GetObjectCommand: class {},
  HeadObjectCommand: class {},
}));
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {},
  GetSecretValueCommand: class {},
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://media.example/image.jpg"),
}));

import { OpenRouterContentAnalyzer } from "./openrouter-content-analyzer";
import type { ContentAnalysisRequest } from "./contracts";
import type { Logger } from "./logger";

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  level: "silent" as const,
  silent: vi.fn(),
} as unknown as Logger;

const request: ContentAnalysisRequest = {
  analysisId: "analysis-1",
  triggerType: "thread_created",
  policyVersion: "v1",
  promptVersion: "v1",
  globalPolicy: "Be respectful.",
  societyRules: [],
  content: { title: "Hello", body: "World", comments: [] },
  images: [],
  engagement: {
    upvotes: 0,
    downvotes: 0,
    netScore: 0,
    visibleCommentCount: 0,
    contextTruncated: false,
  },
  contextCapturedAt: "2026-08-04T00:00:00.000Z",
};

const okBody = JSON.stringify({
  choices: [
    {
      message: {
        content: JSON.stringify({
          decision: "allow",
          sentiment: { label: "neutral", confidence: 0.9 },
          findings: [],
          summary: "Fine",
          rationale: "Nothing to flag.",
        }),
      },
    },
  ],
});

function makeResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeAnalyzer(fetchMock: typeof fetch) {
  vi.stubGlobal("fetch", fetchMock);
  const analyzer = new OpenRouterContentAnalyzer(
    {
      modelId: "openrouter/free",
      region: "us-east-1",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeySecretArn: undefined,
      apiKey: "test-key",
      maxModelTokens: 2048,
      requestTimeoutMs: 5_000,
      maxRetries: 2,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      deadlineMs: 60_000,
      imageUrlExpiresInSeconds: 300,
    },
    {
      allowedBucket: "test-media",
      allowedPrefix: "media/",
      maxImageBytes: 10 * 1024 * 1024,
      maxTotalBytes: 40 * 1024 * 1024,
      maxImages: 4,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    },
    silentLogger,
  );
  return {
    analyzer,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OpenRouterContentAnalyzer retry", () => {
  it("returns the result when the first request succeeds", async () => {
    const { analyzer } = makeAnalyzer(
      vi.fn().mockImplementation(() => Promise.resolve(makeResponse(200, okBody))),
    );
    const result = await analyzer.analyze(request);
    expect(result.decision).toBe("allow");
  });

  it("retries on 429 and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, "{}", { "retry-after": "1" }))
      .mockResolvedValueOnce(makeResponse(200, okBody));
    const { analyzer } = makeAnalyzer(fetchMock);

    const result = await analyzer.analyze(request);
    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503, "{}"))
      .mockResolvedValueOnce(makeResponse(200, okBody));
    const { analyzer } = makeAnalyzer(fetchMock);

    const result = await analyzer.analyze(request);
    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries transient failures and throws", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(makeResponse(429, "{}")),
    );
    const { analyzer } = makeAnalyzer(fetchMock);

    await expect(analyzer.analyze(request)).rejects.toThrow(
      "OpenRouter request failed with HTTP 429",
    );
    // Initial attempt + the configured number of retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors like 400", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(makeResponse(400, "{}")),
    );
    const { analyzer } = makeAnalyzer(fetchMock);

    await expect(analyzer.analyze(request)).rejects.toThrow(
      "OpenRouter request failed with HTTP 400",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("splits a combined three-image request after OpenRouter returns 413", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(413, "{}"))
      .mockImplementation(() => Promise.resolve(makeResponse(200, okBody)));
    const { analyzer } = makeAnalyzer(fetchMock);

    await analyzer.analyze({
      ...request,
      images: [1, 2, 3].map((index) => ({
        bucket: "test-media",
        key: `media/${index}.jpg`,
        contentType: "image/jpeg",
        byteSize: 1,
      })),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).messages[1].content,
    ).toHaveLength(2);
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).messages[1].content,
    ).toHaveLength(2);
    expect(
      JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)).messages[1].content,
    ).toHaveLength(2);
  });
});
