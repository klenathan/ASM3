import { AlertTriangle, Check, Flag, Hammer, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/auth/auth-provider";
import {
  useAppeals,
  useCreateAppeal,
  useDecideAppeal,
  useReport,
} from "@/lib/api/queries";
import { timeAgo } from "@/lib/model";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const REASONS = [
  "Harassment or bullying",
  "Hate speech",
  "Spam or scam",
  "Violence or threat",
  "Explicit content",
  "Other",
];

export function ReportsAppealsPage() {
  const { user } = useAuth();
  const isModerator =
    user?.role === "MODERATOR" || user?.role === "RMIT_ADMIN" || user?.role === "PLATFORM_ADMIN";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-3xl font-black tracking-tight">
          <Flag className="size-6 text-stamp" />
          Reports & appeals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Report a post you believe breaks the rules, or appeal a moderation
          decision on your own content.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportForm />
        <AppealForm />
      </div>

      {isModerator && <AppealsReview />}
    </div>
  );
}

function ReportForm() {
  const report = useReport();
  const [contentId, setContentId] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const enabled = contentId.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) return;
    report.mutate(
      { content_id: contentId.trim(), reason, note: note.trim() },
      { onSuccess: () => setSent(true) }
    );
  };

  if (sent) {
    return (
      <FormCard
        icon={Check}
        title="Report sent"
        desc="Thanks — a moderator will review it. Duplicate reports are ignored, so no need to send it twice."
        stamped
      />
    );
  }

  return (
    <FormCard icon={Flag} title="Report a post">
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Post ID
          </span>
          <input
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            placeholder="e.g. from the post URL"
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Reason
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Note (optional)
          </span>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Anything a moderator should know…"
            className="mt-1 min-h-16"
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={!enabled || report.isPending}>
            {report.isPending ? (
              <>
                <Spinner className="size-3.5" />
                Sending…
              </>
            ) : (
              "Send report"
            )}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}

function AppealForm() {
  const appeal = useCreateAppeal();
  const [contentId, setContentId] = useState("");
  const [contentType, setContentType] = useState<"post" | "comment">("post");
  const [context, setContext] = useState("");
  const [sent, setSent] = useState(false);

  const enabled = contentId.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) return;
    appeal.mutate(
      { contentId: contentId.trim(), contentType, payload: { context: context.trim() } },
      { onSuccess: () => setSent(true) }
    );
  };

  if (sent) {
    return (
      <FormCard
        icon={Check}
        title="Appeal submitted"
        desc="A reviewer will look at your case. Outcomes are upheld or reversed and are fully auditable."
        stamped
      />
    );
  }

  return (
    <FormCard icon={Hammer} title="Appeal a decision">
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Content ID
          </span>
          <input
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            placeholder="ID of your rejected or flagged post"
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Content type
          </span>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as "post" | "comment")}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="post">Post</option>
            <option value="comment">Reply</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Why should it be reviewed?
          </span>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            maxLength={1000}
            placeholder="Add context a reviewer should consider…"
            className="mt-1 min-h-16"
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={!enabled || appeal.isPending}>
            {appeal.isPending ? (
              <>
                <Spinner className="size-3.5" />
                Submitting…
              </>
            ) : (
              "Submit appeal"
            )}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}

function AppealsReview() {
  const appeals = useAppeals("OPEN");
  const decide = useDecideAppeal();

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-display text-2xl font-black tracking-tight">
        <AlertTriangle className="size-5 text-stamp" />
        Open appeals
      </h2>
      {appeals.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Spinner className="size-5" />
          <span className="text-sm">Loading appeals…</span>
        </div>
      ) : (appeals.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
          <p className="font-display text-2xl font-black tracking-tight">No open appeals</p>
          <p className="mt-1 text-sm">Nothing waiting for review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(appeals.data ?? []).map((a) => (
            <div
              key={a.appeal_id}
              className="rounded-md border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">@{a.appellant_user_id}</span>
                <span aria-hidden>·</span>
                <span>{a.content_type}</span>
                <span aria-hidden>·</span>
                <span>{timeAgo(a.created_at)}</span>
              </div>
              {a.context && (
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                  “{a.context}”
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2 border-t border-border/70 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  onClick={() =>
                    decide.mutate({
                      appealId: a.appeal_id,
                      upheld: false,
                      reason: "Decision upheld",
                    })
                  }
                >
                  <X className="size-3.5" />
                  Uphold
                </Button>
                <Button
                  size="sm"
                  className="border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                  onClick={() =>
                    decide.mutate({
                      appealId: a.appeal_id,
                      upheld: true,
                      reason: "Decision reversed",
                    })
                  }
                >
                  <Check className="size-3.5" />
                  Reverse
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FormCard({
  icon: Icon,
  title,
  desc,
  stamped,
  children,
}: {
  icon: typeof Flag;
  title: string;
  desc?: string;
  stamped?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-card p-5",
        stamped && "border-stamp/40 bg-stamp/[0.03]"
      )}
    >
      <h2 className="flex items-center gap-2 font-display text-xl font-black tracking-tight">
        <Icon className="size-5 text-stamp" />
        {title}
      </h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      {children}
    </section>
  );
}
