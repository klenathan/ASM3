import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import {
  useDecideModeration,
  useModerationItem,
  useModerationQueue,
} from "@/lib/api/queries";
import type { ModerationDecision, Post } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type QueueStatus = "PENDING" | "FLAGGED" | "ALL";

export function ModerationPage() {
  const [tab, setTab] = useState<QueueStatus>("PENDING");
  const decide = useDecideModeration();

  const queue = useModerationQueue(tab === "ALL" ? "PENDING" : tab);

  const itemIds = queue.data?.items ?? [];

  return (
    <div className="space-y-6 rounded-lg border border-border bg-[#0e0d0c] p-5 text-[#f2efe9] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-black tracking-tight">
            <ShieldCheck className="size-5 text-[#ff5a3c]" />
            Review desk
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Queued by risk, age and source. Nothing here is public.
          </p>
        </div>
        <span className="rounded border border-[#ff5a3c]/40 px-2 py-1 font-display text-xs font-black tracking-widest text-[#ff5a3c]">
          QUEUE · {itemIds.length}
        </span>
      </header>

      <div className="flex gap-2">
        {(["PENDING", "FLAGGED", "ALL"] as QueueStatus[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#ff5a3c]/60",
              tab === t
                ? "bg-[#ff5a3c] text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            {t === "ALL" ? "All" : `${t[0]}${t.slice(1).toLowerCase()}`}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-white/50">
          <Spinner className="size-5" />
          <span className="text-sm">Loading queue…</span>
        </div>
      ) : itemIds.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/15 p-12 text-center text-white/50">
          <p className="font-display text-2xl font-black tracking-tight">
            Desk clear
          </p>
          <p className="mt-1 text-sm">Nothing waiting in this queue.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {itemIds.map((id) => (
            <QueueItem
              key={id}
              contentId={id}
              onDecide={(decision) =>
                decide.mutate({
                  contentId: id,
                  contentType: "post",
                  review: { decision, reason: "Reviewed in desk", requires_warning: false },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueItem({
  contentId,
  onDecide,
}: {
  contentId: string;
  onDecide: (decision: ModerationDecision) => void;
}) {
  const item = useModerationItem(contentId);
  const [revealed, setRevealed] = useState(false);

  if (item.isLoading) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
        Loading item…
      </div>
    );
  }
  if (item.isError || !item.data) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
        Item unavailable
      </div>
    );
  }

  const content = item.data.content as Post;
  const isHighRisk = content.state === "FLAGGED";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
        <span className="font-semibold text-white">
          {item.data.content_type}
        </span>
        <span aria-hidden>·</span>
        <span>{content.state.toLowerCase()}</span>
      </div>

      {isHighRisk ? (
        <button
          onClick={() => setRevealed((r) => !r)}
          className="mt-3 flex w-full items-start gap-2 rounded-md border border-yellow-400/25 bg-yellow-400/5 px-3 py-2.5 text-left text-sm text-yellow-200/90 hover:bg-yellow-400/10 focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {revealed ? (
            <span>{content.body}</span>
          ) : (
            <span>Flagged content. Reveal to review.</span>
          )}
        </button>
      ) : (
        <p className={cn("mt-3 text-sm leading-relaxed", !revealed && "blur-sm select-none")}>
          {content.body}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <span className="font-display text-xs font-bold tracking-widest text-[#ff5a3c] uppercase">
          {content.state === "FLAGGED" ? "Review" : "Check"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
            aria-label="Approve"
            onClick={() => onDecide("APPROVE")}
          >
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-[#ff5a3c]/40 bg-[#ff5a3c]/10 text-[#ff5a3c] hover:bg-[#ff5a3c]/20"
            aria-label="Reject"
            onClick={() => onDecide("REJECT")}
          >
            <X className="size-3.5" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
