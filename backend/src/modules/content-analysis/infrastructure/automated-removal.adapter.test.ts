import { describe, expect, it, vi } from "vitest";

import {
  type RemoveThreadIfPublishedInput,
  type AutoRemovedEvent,
} from "../application/automated-removal.port";
import { DiscussionsAutomatedRemovalAdapter } from "./automated-removal.adapter";

const input: RemoveThreadIfPublishedInput = {
  threadId: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  authorId: "33333333-3333-4333-8333-333333333333",
  analysisRunId: "44444444-4444-4444-8444-444444444444",
  reasonCode: "high_severity_high_confidence",
  threshold: 0.9,
  finding: {
    category: "harassment",
    severity: "high",
    confidence: 0.97,
    source: "body",
    sourceId: "src-1",
  },
  modelId: "deepseek/test",
  promptVersion: "prompt-1",
  policyVersion: "v2",
  occurredAtEpochMs: 0,
};

function makeAdapter(removeResult: "removed" | "already_inactive") {
  const removeThreadIfPublished = vi.fn(async () => removeResult);
  const publishAutoRemoved = vi.fn(async (_event: AutoRemovedEvent) => undefined);
  const adapter = new DiscussionsAutomatedRemovalAdapter({
    removeThreadIfPublished,
    publishAutoRemoved,
  });
  return { adapter, removeThreadIfPublished, publishAutoRemoved };
}

describe("DiscussionsAutomatedRemovalAdapter", () => {
  it("publishes the auto-removed event only when the thread was actually removed", async () => {
    const { adapter, removeThreadIfPublished, publishAutoRemoved } =
      makeAdapter("removed");

    const result = await adapter.removeThreadIfPublished(input);

    expect(result).toBe("removed");
    expect(removeThreadIfPublished).toHaveBeenCalledTimes(1);
    expect(removeThreadIfPublished).toHaveBeenCalledWith(input);
    expect(publishAutoRemoved).toHaveBeenCalledTimes(1);

    const published = publishAutoRemoved.mock.calls[0]?.[0];
    expect(published?.eventId).toBe(input.analysisRunId);
    expect(published?.eventType).toBe("thread.auto_removed");
    expect(published?.threadId).toBe(input.threadId);
  });

  it("does not publish when the thread is already inactive", async () => {
    const { adapter, removeThreadIfPublished, publishAutoRemoved } =
      makeAdapter("already_inactive");

    const result = await adapter.removeThreadIfPublished(input);

    expect(result).toBe("already_inactive");
    expect(removeThreadIfPublished).toHaveBeenCalledTimes(1);
    expect(publishAutoRemoved).not.toHaveBeenCalled();
  });

  it("propagates the removal port result without swallowing errors", async () => {
    const removeThreadIfPublished = vi.fn(async () => {
      throw new Error("removal port failure");
    });
    const publishAutoRemoved = vi.fn(async () => undefined);
    const adapter = new DiscussionsAutomatedRemovalAdapter({
      removeThreadIfPublished,
      publishAutoRemoved,
    });

    await expect(adapter.removeThreadIfPublished(input)).rejects.toThrow(
      "removal port failure",
    );
    expect(publishAutoRemoved).not.toHaveBeenCalled();
  });
});
