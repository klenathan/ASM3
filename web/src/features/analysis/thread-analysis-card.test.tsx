import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { ANALYSIS_STALE_AFTER_MS } from "./analysis-action-visibility";
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

const actionScope = { scope: "admin" as const };

function renderCard(el: ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {el}
    </QueryClientProvider>,
  );
}

const props = {
  threadId: "t1",
  actionScope,
  threadUpdatedAt: new Date(Date.now() - 1_000).toISOString(),
};

describe("ThreadAnalysisCard", () => {
  it("shows a loading skeleton while pending", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={undefined} status="loading" />);
    expect(screen.getByLabelText("Loading analysis")).toBeInTheDocument();
  });

  it("shows an empty state without override actions for fresh pending analysis", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={null} status="success" />);
    expect(
      screen.getByText("No analysis has been recorded for this thread yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
  });

  it("shows override actions when pending analysis is stale", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        threadUpdatedAt={new Date(Date.now() - ANALYSIS_STALE_AFTER_MS - 1_000).toISOString()}
        analysis={null}
        status="success"
      />,
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-analyze" })).toBeInTheDocument();
  });

  it("renders the full analysis outcome for privileged viewers", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={fullAnalysis} status="success" />);
    expect(screen.getByText("Automated analysis")).toBeInTheDocument();
    expect(screen.getByText("Flagged for review")).toBeInTheDocument();
    expect(screen.getByText("Flagged for a possible policy violation.")).toBeInTheDocument();
    expect(screen.getByText("Harassment")).toBeInTheDocument();
    expect(screen.getByText("negative")).toBeInTheDocument();
    expect(screen.getByText(/Model: deepseek\/test/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt v2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("surfaces a load error", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={undefined} status="error" />);
    expect(
      screen.getByText("Could not load the analysis for this thread."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });
});
