import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnalysisBadge } from "./analysis-badge";

describe("AnalysisBadge", () => {
  it("renders Reviewed for an allow decision", () => {
    render(<AnalysisBadge decision="allow" />);
    expect(screen.getByText("Reviewed by automated content check")).toBeTruthy();
  });

  it("renders Flagged for review for a review decision", () => {
    render(<AnalysisBadge decision="review" />);
    expect(screen.getByText("Flagged for review")).toBeTruthy();
  });

  it("renders Analysis pending when there is no decision", () => {
    render(<AnalysisBadge decision={null} />);
    expect(screen.getByText("Analysis pending")).toBeTruthy();
  });

  it("renders Analysis pending when the decision is undefined", () => {
    render(<AnalysisBadge decision={undefined} />);
    expect(screen.getByText("Analysis pending")).toBeTruthy();
  });
});
