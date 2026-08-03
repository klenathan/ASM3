import { useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";

import {
  claimReport,
  dismissReport,
  fetchReports,
  resolveReport,
  type Report,
  type ReportStatus,
  type ResolveAction,
} from "./moderation-api";

const PAGE_LIMIT = 20;

const OPEN_STATUSES: readonly ReportStatus[] = ["pending", "in_review"];
const RESOLVED_STATUSES: readonly ReportStatus[] = ["resolved", "dismissed"];

function shortId(id: string | null): string {
  if (id === null) return "—";
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function statusBadge(status: Report["status"]) {
  switch (status) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "in_review":
      return <Badge variant="secondary">In review</Badge>;
    case "resolved":
      return <Badge>Resolved</Badge>;
    case "dismissed":
      return (
        <Badge variant="outline" className="opacity-60">
          Dismissed
        </Badge>
      );
  }
}

function targetLabel(report: Report): string {
  const type = report.targetType === "thread" ? "Thread" : "Comment";
  return `${type} · ${shortId(report.targetId)}`;
}

function truncated(value: string | null, max = 64): string {
  if (value === null) return "—";
  const trimmed = value.trim();
  if (trimmed === "") return "—";
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

const RESOLVE_ACTION_LABELS: Record<ResolveAction, string> = {
  remove_content: "Remove content",
  ban_member: "Ban member",
  suspend_user: "Suspend user",
};

function useReportStatusQuery(status: ReportStatus, enabled: boolean) {
  return useInfiniteQuery({
    enabled,
    queryKey: ["admin", "reports", status],
    queryFn: ({ pageParam }) =>
      fetchReports({ status, cursor: pageParam as string | undefined, limit: PAGE_LIMIT }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

interface ReportQueue {
  readonly items: Report[];
  readonly isLoading: boolean;
  readonly isFetchingNextPage: boolean;
  readonly error: Error | null;
  readonly hasNextPage: boolean;
  readonly loadMore: () => void;
  readonly refetch: () => void;
}

function useReportQueue(activeStatuses: readonly ReportStatus[]): ReportQueue {
  const pending = useReportStatusQuery("pending", activeStatuses.includes("pending"));
  const inReview = useReportStatusQuery("in_review", activeStatuses.includes("in_review"));
  const resolved = useReportStatusQuery("resolved", activeStatuses.includes("resolved"));
  const dismissed = useReportStatusQuery("dismissed", activeStatuses.includes("dismissed"));

  const active = [
    { status: "pending" as const, query: pending },
    { status: "in_review" as const, query: inReview },
    { status: "resolved" as const, query: resolved },
    { status: "dismissed" as const, query: dismissed },
  ].filter(({ status }) => activeStatuses.includes(status));

  const loadingQueries = active.map(({ query }) => query);

  const items = Array.from(
    new Map(
      loadingQueries
        .flatMap((q) => q.data?.pages.flatMap((page) => page.items) ?? [])
        .map((report) => [report.id, report] as const),
    ).values(),
  ).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    items,
    isLoading: loadingQueries.some((q) => q.isLoading),
    isFetchingNextPage: loadingQueries.some((q) => q.isFetchingNextPage),
    error: loadingQueries.find((q) => q.error)?.error ?? null,
    hasNextPage: loadingQueries.some((q) => q.hasNextPage),
    loadMore: () => {
      for (const { query } of active) {
        if (query.hasNextPage) void query.fetchNextPage();
      }
    },
    refetch: () => {
      loadingQueries.forEach((q) => void q.refetch());
    },
  };
}

function useClaimReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => claimReport(reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast.success("Report claimed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function ResolveReportDialog({
  report,
  open,
  onOpenChange,
}: {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ResolveAction>("remove_content");
  const [resolutionNote, setResolutionNote] = useState("");
  const [suspendedUntil, setSuspendedUntil] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      resolveReport(report.id, {
        action,
        ...(resolutionNote.trim() === "" ? {} : { resolutionNote: resolutionNote.trim() }),
        suspendedUntil:
          action === "suspend_user" && suspendedUntil !== ""
            ? suspendedUntil
            : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast.success("Report resolved.");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isSuspending = action === "suspend_user";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Resolve report</DialogTitle>
            <DialogDescription>
              {shortId(report.targetId)} — pick the action and add a note for the record.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`resolve-action-${report.id}`}>Action</Label>
              <Select
                value={action}
                onValueChange={(value) => setAction(value as ResolveAction)}
              >
                <SelectTrigger id={`resolve-action-${report.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(RESOLVE_ACTION_LABELS) as ResolveAction[]
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {RESOLVE_ACTION_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSuspending && (
              <div className="grid gap-2">
                <Label htmlFor={`suspend-until-${report.id}`}>
                  Suspended until (optional)
                </Label>
                <Input
                  id={`suspend-until-${report.id}`}
                  type="datetime-local"
                  value={suspendedUntil}
                  onChange={(event) => setSuspendedUntil(event.target.value)}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`resolve-note-${report.id}`}>Resolution note (optional)</Label>
              <Textarea
                id={`resolve-note-${report.id}`}
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                placeholder="What did you do?"
              />
            </div>
          </div>

          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error?.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Resolve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DismissReportDialog({
  report,
  open,
  onOpenChange,
}: {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [resolutionNote, setResolutionNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      dismissReport(report.id, {
        ...(resolutionNote.trim() === "" ? {} : { resolutionNote: resolutionNote.trim() }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast.success("Report dismissed.");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Dismiss report</DialogTitle>
            <DialogDescription>
              Mark {shortId(report.targetId)} as not actionable, without removing content.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`dismiss-note-${report.id}`}>Note (optional)</Label>
            <Textarea
              id={`dismiss-note-${report.id}`}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Why is this not actionable?"
            />
          </div>

          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error?.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={mutation.isPending}>
              Dismiss
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenRowActions({ report }: { report: Report }) {
  const [dialog, setDialog] = useState<null | "resolve" | "dismiss">(null);
  const claim = useClaimReport();
  const isClaimed = report.assignedTo !== null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Report actions">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isClaimed || claim.isPending}
            onSelect={() => claim.mutate(report.id)}
          >
            Claim
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("resolve")}>
            Resolve
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("dismiss")}>
            Dismiss
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "resolve" && (
        <ResolveReportDialog
          report={report}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      )}
      {dialog === "dismiss" && (
        <DismissReportDialog
          report={report}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      )}
    </>
  );
}

function HistoryRowNote({ report }: { report: Report }) {
  const resolution = report.resolution
    ? report.resolution.replaceAll("_", " ")
    : null;
  return (
    <div className="flex flex-col gap-0.5">
      {resolution && <span className="text-xs text-foreground">{resolution}</span>}
      <span className="text-xs text-muted-foreground">
        {report.resolutionNote ?? "No note left."}
      </span>
    </div>
  );
}

function ReportsTable({
  reports,
  mode,
}: {
  reports: Report[];
  mode: "open" | "history";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reason</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Reporter</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Claimed by</TableHead>
          <TableHead>Created</TableHead>
          {mode === "open" ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Note</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{report.reason}</span>
                {report.details && (
                  <span className="text-xs text-muted-foreground">
                    {truncated(report.details)}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>{targetLabel(report)}</TableCell>
            <TableCell>{shortId(report.reporterId)}</TableCell>
            <TableCell>{statusBadge(report.status)}</TableCell>
            <TableCell>{shortId(report.assignedTo)}</TableCell>
            <TableCell>{formatDateTime(report.createdAt)}</TableCell>
            {mode === "open" ? (
              <TableCell className="text-right">
                <OpenRowActions report={report} />
              </TableCell>
            ) : (
              <TableCell>
                <HistoryRowNote report={report} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QueueSkeleton() {
  return (
    <div aria-label="Loading reports" className="space-y-3 p-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  );
}

export function ModerationSection() {
  const [tab, setTab] = useState<"open" | "history">("open");
  const activeStatuses = tab === "open" ? OPEN_STATUSES : RESOLVED_STATUSES;
  const queue = useReportQueue(activeStatuses);

  return (
    <section aria-labelledby="moderation-heading">
      <h2
        id="moderation-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Moderation
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Global report queue and resolution history.
      </p>

      <div className="mt-6">
        <Tabs value={tab} onValueChange={(value) => setTab(value as "open" | "history")}>
          <TabsList>
            <TabsTrigger value="open">Open queue</TabsTrigger>
            <TabsTrigger value="history">Resolved history</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4">
            <QueueBody queue={queue} mode="open" />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <QueueBody queue={queue} mode="history" />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function QueueBody({
  queue,
  mode,
}: {
  queue: ReportQueue;
  mode: "open" | "history";
}) {
  if (queue.isLoading) {
    return <QueueSkeleton />;
  }

  if (queue.error !== null) {
    return (
      <div className="border border-destructive/30 px-4 py-5">
        <p role="alert" className="text-sm text-destructive">
          {queue.error?.message}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={queue.refetch}
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (queue.items.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {mode === "open"
          ? "No open reports right now."
          : "No resolved or dismissed reports yet."}
      </p>
    );
  }

  return (
    <>
      <div className="border">
        <ReportsTable reports={queue.items} mode={mode} />
      </div>
      {queue.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={queue.loadMore}
            disabled={queue.isFetchingNextPage}
          >
            {queue.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
