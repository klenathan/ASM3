import { describe, expect, it, vi } from "vitest";

import type { LambdaEvent } from "./contracts";
import { createHandler } from "./handler";

const event: LambdaEvent = {
  request: {
    analysisId: "analysis-1",
    triggerType: "thread_created",
    policyVersion: "policy-1",
    promptVersion: "prompt-1",
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
  },
};

const env = {
  OPENROUTER_MODEL: "openrouter/free",
  OPENROUTER_API_KEY: "test-key",
  ALLOWED_MEDIA_BUCKET: "test-media",
  ALLOWED_MEDIA_PREFIX: "media/",
};

describe("content-analysis Lambda handler", () => {
  it("ignores Lambda's third callback argument instead of treating it as environment", async () => {
    const result = {
      decision: "allow" as const,
      sentiment: { label: "neutral" as const, confidence: 0.9 },
      findings: [],
      summary: "Allowed",
    };
    const analyze = vi.fn().mockResolvedValue(result);
    const runtimeHandler = createHandler(env, (config) => {
      expect(config.modelId).toBe("openrouter/free");
      return { analyze };
    });

    await expect(runtimeHandler(event, {}, vi.fn())).resolves.toEqual(result);
    expect(analyze).toHaveBeenCalledWith(event.request);
  });

  it("reports the actual missing environment-variable name", async () => {
    const runtimeHandler = createHandler(
      { ...env, OPENROUTER_MODEL: "" },
      () => ({ analyze: vi.fn() }),
    );

    await expect(runtimeHandler(event, {}, vi.fn())).rejects.toThrow(
      "missing required env: OPENROUTER_MODEL",
    );
  });
});
