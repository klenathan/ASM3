import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { ThreadAnalysisCard } from "./thread-analysis-card";
import type { ThreadAnalysis } from "./types";

const fullAnalysis: ThreadAnalysis = {
  runId: "40000000-0000-4000-8000-000000000001",
  status: "succeeded",
  decision: "review",
  override: null,
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

const failedAnalysis: ThreadAnalysis = {
  runId: "40000000-0000-4000-8000-000000000002",
  status: "failed",
  decision: null,
  override: null,
  sentiment: null,
  findings: null,
  summary: null,
  rationale: null,
  modelId: null,
  promptVersion: null,
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
  canAct: true,
};

describe("ThreadAnalysisCard", () => {
  it("shows a loading skeleton while pending", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={undefined} status="loading" />);
    expect(screen.getByLabelText("Loading analysis")).toBeInTheDocument();
  });

  it("shows an empty state without override actions while pending", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={null} status="success" />);
    expect(
      screen.getByText("No analysis has been recorded for this thread yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
  });

  it("shows override actions and a failed badge when the analysis failed", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={failedAnalysis} status="success" />);
    expect(screen.getByText("Automated analysis failed")).toBeInTheDocument();
    expect(screen.getByText("The automated analysis failed. Use Re-analyze to retry it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-analyze" })).toBeInTheDocument();
  });

  it("hides the Re-analyze retry text from ordinary users but still marks failure", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        canAct={false}
        analysis={failedAnalysis}
        status="success"
      />,
    );
    expect(screen.getByText("Automated analysis failed")).toBeInTheDocument();
    expect(
      screen.getByText("This thread could not be analyzed automatically."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The automated analysis failed. Use Re-analyze to retry it."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
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

  it("shows the analysis read-only for ordinary users (no override actions)", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        canAct={false}
        analysis={fullAnalysis}
        status="success"
      />,
    );
    expect(screen.getByText("Automated analysis")).toBeInTheDocument();
    expect(screen.getByText("Flagged for a possible policy violation.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
  });

  it("shows an approved state and hides actions after a human accept override", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        analysis={{ ...fullAnalysis, override: "accept" }}
        status="success"
      />,
    );
    expect(
      screen.getByText("Approved — accepted for review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This post was accepted for publication after manual review."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
  });

  it("shows a rejected state and hides actions after a human reject override", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        analysis={{ ...fullAnalysis, override: "reject" }}
        status="success"
      />,
    );
    expect(screen.getByText("Rejected — hidden")).toBeInTheDocument();
    expect(
      screen.getByText("This post was rejected by a moderator or admin and is hidden from the community."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("surfaces the Automatically hidden badge for an auto-removed thread", () => {
    renderCard(
      <ThreadAnalysisCard
        {...props}
        analysis={fullAnalysis}
        status="success"
        autoRemoved
      />,
    );
    expect(screen.getByText("Automatically hidden")).toBeInTheDocument();
    expect(screen.queryByText("Flagged for review")).not.toBeInTheDocument();
  });

  it("surfaces a load error", () => {
    renderCard(<ThreadAnalysisCard {...props} analysis={undefined} status="error" />);
    expect(
      screen.getByText("Could not load the analysis for this thread."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });
});
