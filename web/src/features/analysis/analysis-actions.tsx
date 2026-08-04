import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  reanalyzeThread,
  setAnalysisDecision,
  type AnalysisActionScope,
} from "./analysis-api";

/**
 * Accept / Reject / Re-analyze controls for overriding a thread's automated
 * content-analysis outcome. Reject hides the post (published -> removed),
 * Accept confirms it, Re-analyze re-runs the analysis. `onResolved` fires
 * after any successful action so the caller can refetch its views.
 */
export function AnalysisActions({
  threadId,
  actionScope,
  onResolved,
}: {
  readonly threadId: string;
  readonly actionScope: AnalysisActionScope;
  readonly onResolved?: () => void;
}) {
  const decisionMutation = useMutation({
    mutationFn: (input: { decision: "accept" | "reject"; reason?: string }) =>
      setAnalysisDecision({
        ...actionScope,
        threadId,
        decision: input.decision,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }),
    onSuccess: onResolved,
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => reanalyzeThread({ ...actionScope, threadId }),
    onSuccess: onResolved,
  });

  const busy = decisionMutation.isPending || reanalyzeMutation.isPending;

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
  );
}
