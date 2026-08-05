import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

import { Button } from "../../components/ui/button";
import {
  reanalyzeThread,
  setAnalysisDecision,
  type AnalysisActionScope,
} from "./analysis-api";
import {
  shouldShowAnalysisActions,
  type AnalysisActionDecision,
} from "./analysis-action-visibility";

/**
 * Accept / Reject / Re-analyze controls for overriding a thread's automated
 * content-analysis outcome. Reject hides the post (published -> removed),
 * Accept confirms it, Re-analyze re-runs the analysis. Actions are rendered
 * only when the outcome is RESOLVED (accept / review / failed); threads still
 * pending a decision get no actions. `onResolved` fires after any successful
 * action so the caller can refetch its views.
 */
function errorText(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "Something went wrong. Please try again.";
}

export function AnalysisActions({
  threadId,
  actionScope,
  decision,
  failed = false,
  onResolved,
}: {
  readonly threadId: string;
  readonly actionScope: AnalysisActionScope;
  readonly decision: AnalysisActionDecision;
  /** Latest analysis run failed (resolved, decision is null). */
  readonly failed?: boolean;
  readonly onResolved?: () => void;
}) {
  const [feedback, setFeedback] = useState<
    | { kind: "success" | "error"; text: string }
    | null
  >(null);

  const flash = (kind: "success" | "error", text: string) => {
    setFeedback({ kind, text });
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const decisionMutation = useMutation({
    mutationFn: (input: { decision: "accept" | "reject"; reason?: string }) =>
      setAnalysisDecision({
        ...actionScope,
        threadId,
        decision: input.decision,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }),
    onSuccess: (_data, input) => {
      onResolved?.();
      flash(
        "success",
        input.decision === "accept"
          ? "Post approved."
          : "Post rejected and hidden.",
      );
    },
    onError: (error) => flash("error", errorText(error)),
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => reanalyzeThread({ ...actionScope, threadId }),
    onSuccess: () => {
      onResolved?.();
      flash("success", "Re-analysis queued.");
    },
    onError: (error) => flash("error", errorText(error)),
  });

  const busy = decisionMutation.isPending || reanalyzeMutation.isPending;

  if (!shouldShowAnalysisActions(decision, failed)) return null;

  const handleReject = () => {
    if (!window.confirm("Reject this post? It will be hidden from the community."))
      return;
    const reason = window.prompt(
      "Optional reason for rejecting (left blank if none):",
    );
    if (reason === null) return;
    decisionMutation.mutate({
      decision: "reject",
      ...(reason.trim().length === 0 ? {} : { reason: reason.trim() }),
    });
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => decisionMutation.mutate({ decision: "accept" })}
          disabled={busy}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={handleReject}
          disabled={busy}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => reanalyzeMutation.mutate(undefined)}
          disabled={busy}
        >
          {reanalyzeMutation.isPending ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            "Re-analyze"
          )}
        </Button>
      </div>
      {feedback !== null && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-1.5 text-xs leading-5",
            feedback.kind === "success"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-destructive",
          )}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {feedback.text}
        </p>
      )}
    </div>
  );
}
