import { Check } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

export type AnalysisDecision = "allow" | "review" | null | undefined;

const TITLES = {
  allow: "Reviewed by automated content check",
  review: "Flagged for review",
  failed: "Automated analysis failed",
  autoRemoved: "Automatically hidden",
  hidden: "Hidden",
  pending: "Analysis pending",
  approved: "Approved — accepted for review",
  rejected: "Rejected — hidden",
} as const;

/**
 * Small badge surfacing the automated content-analysis outcome of a post.
 *   - "allow"       → green "Reviewed"
 *   - "review"      → amber "Flagged for review" (published, awaiting review)
 *   - "failed"      → red "Automated analysis failed" (latest run errored)
 *   - "auto-removed" → red "Automatically hidden" (only when the caller can
 *     authoritatively prove the thread was hidden by the automated policy;
 *     see `isAutoRemoved` in the analysis feature)
 *   - "hidden"      → red "Hidden" (thread is no longer published; the caller
 *     knows its status but cannot prove the automated origin)
 *   - none          → neutral "Analysis pending"
 */
export function AnalysisBadge({
  decision,
  failed = false,
  autoRemoved = false,
  hidden = false,
  override = null,
  className,
}: {
  readonly decision: AnalysisDecision;
  /** Latest analysis run failed (decision is null). */
  readonly failed?: boolean;
  /** Authoritative "hidden by automated policy" state. Overrides everything. */
  readonly autoRemoved?: boolean;
  /** Thread is no longer published. Overrides review/pending. */
  readonly hidden?: boolean;
  /** Latest human override; `accept` approves, `reject` hides. */
  readonly override?: "accept" | "reject" | null;
  readonly className?: string;
}) {
  const status =
    override === "accept"
      ? "approved"
      : override === "reject"
        ? "rejected"
        : autoRemoved
          ? "autoRemoved"
          : hidden
            ? "hidden"
            : failed
              ? "failed"
              : decision === "allow" || decision === "review"
                ? decision
                : "pending";

  return (
    <Badge
      variant="outline"
      title={TITLES[status]}
      className={cn(
        status === "allow" &&
          "border-green-200/35 bg-green-200/20 text-foreground",
        status === "review" && "border-signal/60 bg-signal/20 text-foreground",
        (status === "autoRemoved" ||
          status === "hidden" ||
          status === "failed" ||
          status === "rejected") &&
          "border-primary/45 bg-accent text-primary",
        status === "approved" && "border-green/35 bg-accent text-foreground",
        status === "pending" && "border-foreground/20 text-muted-foreground",
        className,
      )}
    >
      {(status === "allow" || status === "approved") && (
        <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
      )}
      {TITLES[status]}
    </Badge>
  );
}
