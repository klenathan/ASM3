import { ShieldCheck } from "lucide-react";

import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { AnalysisBadge } from "../discussions/analysis-badge";
import { AnalysisActions } from "./analysis-actions";
import type { AnalysisActionScope } from "./analysis-api";
import type { AnalysisFinding, ThreadAnalysis } from "./types";

const SEVERITY_STYLES: Record<AnalysisFinding["severity"], string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  medium: "text-amber-700 dark:text-amber-400",
  high: "text-red-700 dark:text-red-400",
};

const SOURCE_LABELS: Record<AnalysisFinding["source"], string> = {
  title: "Title",
  body: "Body",
  image: "Image",
  comment: "Comment",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function shortDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function FindingRow({ finding }: { readonly finding: AnalysisFinding }) {
  return (
    <li className="border-l-2 border-foreground/15 pl-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{finding.category}</span>
        <span className={`text-xs font-semibold uppercase ${SEVERITY_STYLES[finding.severity]}`}>
          {finding.severity}
        </span>
        <span className="text-xs text-muted-foreground">
          {percent(finding.confidence)} · {SOURCE_LABELS[finding.source]}
          {finding.sourceId !== undefined ? ` · ${finding.sourceId.slice(0, 8)}` : ""}
        </span>
      </div>
      {finding.evidence.length > 0 && (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{finding.evidence}</p>
      )}
    </li>
  );
}

/**
 * Small card surfacing the full automated content-analysis outcome for a
 * thread, plus (for the thread's moderators and system admins) the
 * Accept / Reject / Re-analyze override actions. Ordinary users see the
 * analysis read-only; override actions are rendered only when `canAct` is
 * true. Authorization for actions is enforced server-side.
 */
export function ThreadAnalysisCard({
  analysis,
  status,
  threadId,
  actionScope,
  threadUpdatedAt,
  autoRemoved = false,
  canAct = false,
  onResolved,
}: {
  readonly analysis: ThreadAnalysis | null | undefined;
  readonly status: "loading" | "success" | "error";
  readonly threadId: string;
  readonly actionScope?: AnalysisActionScope;
  readonly threadUpdatedAt: string;
  /** Authoritative "hidden by automated policy" state (see `isAutoRemoved`). */
  readonly autoRemoved?: boolean;
  /** Show Accept / Reject / Re-analyze override controls (privileged callers). */
  readonly canAct?: boolean;
  readonly onResolved?: () => void;
}) {
  return (
    <Card size="sm" className="mt-6">
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Automated analysis
        </CardTitle>
        <CardAction>
          <AnalysisBadge
            decision={analysis?.decision ?? null}
            autoRemoved={autoRemoved}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {status === "loading" ? (
          <div className="space-y-2" aria-label="Loading analysis">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the analysis for this thread.
          </p>
        ) : analysis == null ? (
          <p className="text-sm leading-6 text-muted-foreground">
            No analysis has been recorded for this thread yet.
          </p>
        ) : (
          <div className="space-y-4">
            {analysis.summary !== null && analysis.summary.length > 0 && (
              <p className="text-sm leading-6">{analysis.summary}</p>
            )}
            {analysis.sentiment !== null && (
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Sentiment <span className="font-semibold text-foreground">{analysis.sentiment.label}</span>{" "}
                · {percent(analysis.sentiment.confidence)}
              </p>
            )}
            {analysis.findings !== null && analysis.findings.length > 0 && (
              <ul className="space-y-3">
                {analysis.findings.map((finding, index) => (
                  <FindingRow key={`${finding.category}-${index}`} finding={finding} />
                ))}
              </ul>
            )}
            {analysis.rationale !== null && analysis.rationale.length > 0 && (
              <p className="text-sm leading-6 text-muted-foreground">{analysis.rationale}</p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {status === "success" && analysis != null && (
            <>
              {analysis.modelId !== null && <span>Model: {analysis.modelId}</span>}
              {analysis.promptVersion !== null && <span>Prompt v{analysis.promptVersion}</span>}
              {shortDate(analysis.completedAt) !== null && (
                <span>{shortDate(analysis.completedAt)}</span>
              )}
            </>
          )}
        </div>
        {canAct && (
          <AnalysisActions
            threadId={threadId}
            actionScope={actionScope ?? { scope: "admin" }}
            decision={analysis?.decision}
            threadUpdatedAt={threadUpdatedAt}
            onResolved={onResolved}
          />
        )}
      </CardFooter>
    </Card>
  );
}
