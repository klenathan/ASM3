import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

export type AnalysisDecision = "allow" | "review" | null | undefined;

const TITLES = {
  allow: "Reviewed by automated content check",
  review: "Flagged for review",
  pending: "Analysis pending",
} as const;

/**
 * Small badge surfacing the automated content-analysis outcome of a post.
 *   - "allow"  → green "Reviewed"
 *   - "review" → amber "Flagged for review"
 *   - none     → neutral "Analysis pending"
 */
export function AnalysisBadge({
  decision,
  className,
}: {
  readonly decision: AnalysisDecision;
  readonly className?: string;
}) {
  const status = decision === "allow" || decision === "review" ? decision : "pending";

  return (
    <Badge
      variant="outline"
      title={TITLES[status]}
      className={cn(
        status === "allow" &&
          "border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
        status === "review" &&
          "border-amber-600/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
        status === "pending" && "text-muted-foreground",
        className,
      )}
    >
      {status === "allow" && <span aria-hidden="true">✓</span>}
      {TITLES[status]}
    </Badge>
  );
}
