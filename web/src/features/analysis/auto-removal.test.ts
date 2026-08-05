import { describe, expect, it } from "vitest";

import { isAutoRemoved, AUTO_REMOVE_CONFIDENCE_THRESHOLD } from "./auto-removal";
import type { ThreadAnalysis } from "./types";

const base: ThreadAnalysis = {
  runId: "40000000-0000-4000-8000-000000000001",
  status: "succeeded",
  decision: "review",
  override: null,
  sentiment: { label: "negative", confidence: 0.8 },
  findings: [
    { category: "Harassment", severity: "high", confidence: 0.92, source: "title", evidence: "x" },
  ],
  summary: null,
  rationale: null,
  modelId: null,
  promptVersion: "2",
  completedAt: "2026-08-02T10:00:00.000Z",
};

function withFindings(
  findings: ThreadAnalysis["findings"],
  decision: ThreadAnalysis["decision"] = "review",
): ThreadAnalysis {
  return { ...base, findings, decision };
}

describe("isAutoRemoved", () => {
  it("returns false for null / undefined analysis", () => {
    expect(isAutoRemoved(null)).toBe(false);
    expect(isAutoRemoved(undefined)).toBe(false);
  });

  it("matches a review decision with a high-severity finding above the threshold", () => {
    expect(isAutoRemoved(base)).toBe(true);
  });

  it("matches a confidence exactly at the threshold (inclusive)", () => {
    expect(isAutoRemoved(withFindings([
      { category: "x", severity: "high", confidence: AUTO_REMOVE_CONFIDENCE_THRESHOLD, source: "body", evidence: "" },
    ]))).toBe(true);
  });

  it("does not match a confidence just below the threshold", () => {
    expect(isAutoRemoved(withFindings([
      { category: "x", severity: "high", confidence: 0.899999, source: "body", evidence: "" },
    ]))).toBe(false);
  });

  it("never matches an allow decision even with a matching finding", () => {
    expect(isAutoRemoved(withFindings(
      [{ category: "x", severity: "high", confidence: 0.99, source: "title", evidence: "" }],
      "allow",
    ))).toBe(false);
  });

  it("ignores low / medium severity findings", () => {
    expect(isAutoRemoved(withFindings([
      { category: "x", severity: "high", confidence: 0.5, source: "body", evidence: "" },
      { category: "y", severity: "medium", confidence: 0.99, source: "body", evidence: "" },
      { category: "z", severity: "low", confidence: 0.99, source: "body", evidence: "" },
    ]))).toBe(false);
  });

  it("matches when at least one finding qualifies even if others are lower", () => {
    expect(isAutoRemoved(withFindings([
      { category: "a", severity: "medium", confidence: 0.99, source: "body", evidence: "" },
      { category: "b", severity: "high", confidence: 0.95, source: "title", evidence: "" },
    ]))).toBe(true);
  });

  it("returns false for empty findings", () => {
    expect(isAutoRemoved(withFindings([]))).toBe(false);
  });

  it("returns false when findings are null and decision is review", () => {
    expect(isAutoRemoved({ ...base, findings: null })).toBe(false);
  });
});
