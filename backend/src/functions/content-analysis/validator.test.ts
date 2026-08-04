import { describe, expect, it } from "vitest";

import { isStrictResult, strictResultIssue } from "./openrouter-content-analyzer";

const validResult = {
  decision: "allow",
  sentiment: { label: "positive", confidence: 0.9 },
  findings: [
    {
      category: "harassment",
      severity: "low",
      confidence: 0.3,
      source: "body",
      evidence: "excerpt",
    },
  ],
  summary: "ok",
  rationale: "reasoning",
};

describe("Lambda isStrictResult (must match backend strict contract)", () => {
  it("accepts a fully valid result", () => {
    expect(isStrictResult(validResult)).toBe(true);
    expect(strictResultIssue(validResult)).toBeNull();
  });

  // Regression: the Lambda previously accepted output without `rationale`,
  // which the backend then rejected as schema-invalid. The two validators must
  // agree so Lambda cannot emit output the backend re-rejects.
  it("rejects a result missing rationale", () => {
    const missing = { ...validResult, rationale: undefined };
    expect(isStrictResult(missing)).toBe(false);
    expect(strictResultIssue(missing)).toBe("rationale is missing or empty");
  });

  it("rejects an empty summary", () => {
    expect(isStrictResult({ ...validResult, summary: "" })).toBe(false);
    expect(strictResultIssue({ ...validResult, summary: "" })).toBe(
      "summary is missing or empty",
    );
  });

  it("rejects an empty finding evidence or category", () => {
    const emptyEvidence = {
      ...validResult,
      findings: [
        { ...validResult.findings[0], evidence: "" },
      ],
    };
    expect(isStrictResult(emptyEvidence)).toBe(false);
    expect(strictResultIssue(emptyEvidence)).toBe("findings[0].evidence is missing or empty");

    const emptyCategory = {
      ...validResult,
      findings: [{ ...validResult.findings[0], category: "" }],
    };
    expect(isStrictResult(emptyCategory)).toBe(false);
    expect(strictResultIssue(emptyCategory)).toContain("category is missing or empty");
  });
});
