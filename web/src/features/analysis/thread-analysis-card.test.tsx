import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThreadAnalysisCard } from "./thread-analysis-card";
import type { ThreadAnalysis } from "./types";

const fullAnalysis: ThreadAnalysis = {
  runId: "40000000-0000-4000-8000-000000000001",
  decision: "review",
  sentiment: { label: "negative", confidence: 0.87 },
  findings: [
    {
      category: "Harassment",
      severity: "high",
      confidence: 0.92,
      source: "title",
      evidence: "Contains targeting language.",
    },
  ],
  summary: "Flagged for a possible policy violation.",
  rationale: "The title may target a named individual.",
  modelId: "deepseek/test",
  promptVersion: "2",
  completedAt: "2026-08-02T10:00:00.000Z",
};

describe("ThreadAnalysisCard", () => {
  it("shows a loading skeleton while pending", () => {
    render(<ThreadAnalysisCard analysis={undefined} status="loading" />);
    expect(screen.getByLabelText("Loading analysis")).toBeInTheDocument();
  });

  it("shows an empty state when no analysis exists", () => {
    render(<ThreadAnalysisCard analysis={null} status="success" />);
    expect(
      screen.getByText("No analysis has been recorded for this thread yet."),
    ).toBeInTheDocument();
  });

  it("renders the full analysis outcome for privileged viewers", () => {
    render(<ThreadAnalysisCard analysis={fullAnalysis} status="success" />);
    expect(screen.getByText("Automated analysis")).toBeInTheDocument();
    expect(screen.getByText("Flagged for review")).toBeInTheDocument();
    expect(screen.getByText("Flagged for a possible policy violation.")).toBeInTheDocument();
    expect(screen.getByText("Harassment")).toBeInTheDocument();
    expect(screen.getByText("negative")).toBeInTheDocument();
    expect(screen.getByText(/Model: deepseek\/test/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt v2/)).toBeInTheDocument();
  });

  it("surfaces a load error", () => {
    render(<ThreadAnalysisCard analysis={undefined} status="error" />);
    expect(
      screen.getByText("Could not load the analysis for this thread."),
    ).toBeInTheDocument();
  });
});
