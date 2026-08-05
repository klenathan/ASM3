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

  it("renders Automatically hidden when autoRemoved is true, overriding review", () => {
    render(<AnalysisBadge decision="review" autoRemoved />);
    expect(screen.getByText("Automatically hidden")).toBeTruthy();
  });

  it("renders Automatically hidden when autoRemoved is true and decision is null", () => {
    render(<AnalysisBadge decision={null} autoRemoved />);
    expect(screen.getByText("Automatically hidden")).toBeTruthy();
  });

  it("renders the normal review state when autoRemoved is false", () => {
    render(<AnalysisBadge decision="review" autoRemoved={false} />);
    expect(screen.getByText("Flagged for review")).toBeTruthy();
  });

  it("renders Hidden when hidden is true, overriding review", () => {
    render(<AnalysisBadge decision="review" hidden />);
    expect(screen.getByText("Hidden")).toBeTruthy();
    expect(screen.queryByText("Flagged for review")).toBeNull();
  });

  it("renders Automatically hidden over plain Hidden when autoRemoved is set", () => {
    render(<AnalysisBadge decision="review" hidden autoRemoved />);
    expect(screen.getByText("Automatically hidden")).toBeTruthy();
  });
});
