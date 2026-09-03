import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  Ban,
  Database,
  Info,
  MessageCircle,
  MessageSquare,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  cancelLatestActionAnalyticsRefresh,
  getActionAnalyticsRefreshStatus,
  getLatestActionAnalyticsRefreshStatus,
  queryActionMetrics,
  refreshActionAnalytics,
} from "./analytics-api";
import type { ActionMetric, RefreshStatus } from "./analytics-api";
const REFRESH_STATUS_LABEL: Record<RefreshStatus, string> = {
  requested: "Queued",
  exporting: "Exporting snapshot",
  querying: "Running metrics",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function refreshStatusVariant(status: RefreshStatus): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "default";
  return "secondary";
}

function isRefreshActive(status: RefreshStatus | undefined): boolean {
  return status === "requested" || status === "exporting" || status === "querying";
}

function MetricTooltip({ explanation, label }: { explanation: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Explanation for ${label}`}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs font-normal">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}


function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function numberValue(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" ? value : 0;
}

interface ActionMetricCardConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  explanation: string;
}

const ACTION_METRIC_CARDS: readonly ActionMetricCardConfig[] = [
  {
    key: "distinctActors",
    label: "Distinct actors",
    icon: Users,
    explanation:
      "Count of unique active users who performed at least one recorded action during the selected period.",
  },
  {
    key: "likesAdded",
    label: "Likes added",
    icon: ThumbsUp,
    explanation: "Total positive reaction upvotes applied to threads or comments.",
  },
  {
    key: "likesRemoved",
    label: "Likes removed",
    icon: MinusCircle,
    explanation: "Total positive reaction upvotes withdrawn or cleared by users.",
  },
  {
    key: "dislikesAdded",
    label: "Dislikes added",
    icon: ThumbsDown,
    explanation: "Total negative reaction downvotes applied to threads or comments.",
  },
  {
    key: "dislikesRemoved",
    label: "Dislikes removed",
    icon: PlusCircle,
    explanation: "Total negative reaction downvotes withdrawn or cleared by users.",
  },
  {
    key: "reactionScoreDelta",
    label: "Reaction score delta",
    icon: Activity,
    explanation:
      "Net change in total reaction score (likes added − likes removed − dislikes added + dislikes removed).",
  },
  {
    key: "joins",
    label: "Joins",
    icon: UserPlus,
    explanation: "Total member join events recorded across all societies during the period.",
  },
  {
    key: "leaves",
    label: "Leaves",
    icon: UserMinus,
    explanation: "Total member departure or unenrollment events across all societies.",
  },
  {
    key: "activations",
    label: "Activations",
    icon: UserCheck,
    explanation: "Total suspended user accounts restored to active status.",
  },
  {
    key: "bans",
    label: "Bans",
    icon: Ban,
    explanation: "Total accounts suspended or banned by moderators or system administrators.",
  },
];

function ActionActivitySummary({ metrics }: { metrics: ActionMetric[] }) {
  const activity = metrics.filter((metric) => metric.metricKind === "activity");
  const totals = activity.reduce<Record<string, number>>((result, metric) => {
    for (const { key } of ACTION_METRIC_CARDS) {
      result[key] = (result[key] ?? 0) + numberValue(metric.data, key);
    }
    return result;
  }, {});
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Action totals">
      {ACTION_METRIC_CARDS.map(({ key, label, icon: Icon, explanation }) => (
        <Card key={key}>
          <CardHeader className="p-4">
            <div className="flex items-center justify-between gap-1 text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <CardDescription className="truncate">{label}</CardDescription>
              </div>
              <MetricTooltip label={label} explanation={explanation} />
            </div>
            <CardTitle className="mt-1 text-2xl font-bold">{totals[key] ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function ActionAnalyticsPanel() {
  const queryClient = useQueryClient();
  const [grain, setGrain] = useState<"platform" | "society" | "content">("platform");
  const [periodStart, setPeriodStart] = useState(dateDaysAgo(6));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [runId, setRunId] = useState<string | null>(null);
  const [refreshWarnings, setRefreshWarnings] = useState<readonly string[]>([]);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const actionQuery = useQuery({
    queryKey: ["analytics", "action-events", grain, periodStart, periodEnd],
    queryFn: () => queryActionMetrics({ grain, periodStart, periodEnd, limit: 100 }),
  });
  const statusQuery = useQuery({
    queryKey: ["analytics", "action-refresh-status", runId],
    queryFn: () => getActionAnalyticsRefreshStatus(runId as string),
    enabled: runId !== null,
    refetchInterval: (query) => isRefreshActive(query.state.data?.status) ? 5_000 : false,
  });
  const latestStatusQuery = useQuery({
    queryKey: ["analytics", "action-refresh-status", "latest"],
    queryFn: getLatestActionAnalyticsRefreshStatus,
    refetchInterval: (query) => isRefreshActive(query.state.data?.status) ? 5_000 : false,
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshActionAnalytics(periodStart, periodEnd),
    onSuccess: (result) => {
      setRefreshWarnings(result.warnings ?? []);
      setCancelMessage(null);
      if (result.runId) setRunId(result.runId);
      void queryClient.invalidateQueries({ queryKey: ["analytics", "action-events"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics", "action-refresh-status", "latest"] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelLatestActionAnalyticsRefresh,
    onSuccess: (result) => {
      setCancelMessage(result.message);
      if (result.cancelled) setRunId(null);
      void queryClient.invalidateQueries({ queryKey: ["analytics", "action-refresh-status"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics", "action-events"] });
    },
  });
  const currentStatus = statusQuery.data ?? latestStatusQuery.data;
  const active = isRefreshActive(currentStatus?.status);
  const metrics = actionQuery.data?.metrics ?? [];
  const currentState = metrics.filter((metric) => metric.metricKind === "current_state");
  const reconciliation = metrics.filter((metric) => metric.metricKind === "reconciliation" && metric.data.status === "mismatch");
  return (
    <section aria-labelledby="action-analytics-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Durable product actions, aggregated by UTC day.</p>
          <h2 id="action-analytics-heading" className="text-xl font-semibold">Action analytics</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => { setCancelMessage(null); cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}
            >
              <XCircle className={cancelMutation.isPending ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"} />
              {cancelMutation.isPending ? "Cancelling…" : "Cancel refresh"}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => { setRefreshWarnings([]); setCancelMessage(null); refreshMutation.mutate(); }}
            disabled={active || refreshMutation.isPending || cancelMutation.isPending}
          >
            <RefreshCw className={refreshMutation.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {active ? "Refresh in progress" : currentStatus?.status === "failed" ? "Retry refresh" : "Refresh analytics"}
          </Button>
        </div>
      </div>
      <div className="rounded border border-border bg-muted/30 p-3 text-sm" aria-live="polite">
        {latestStatusQuery.isLoading ? (
          <span className="text-muted-foreground">Checking latest refresh status…</span>
        ) : latestStatusQuery.isError ? (
          <span className="text-destructive">Unable to load the latest refresh status.</span>
        ) : currentStatus ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Latest refresh:</span>
            <Badge variant={refreshStatusVariant(currentStatus.status)}>
              {REFRESH_STATUS_LABEL[currentStatus.status]}
            </Badge>
            {currentStatus.periodStart && currentStatus.periodEnd ? (
              <span className="text-muted-foreground">
                {currentStatus.periodStart} to {currentStatus.periodEnd}
              </span>
            ) : null}
            {currentStatus.status === "failed" && currentStatus.lastError ? (
              <span className="text-destructive">{currentStatus.lastError}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">No V2 analytics refresh has run yet.</span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm"><span>Period start</span><input aria-label="Period start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="rounded border bg-background px-2 py-1" /></label>
        <label className="grid gap-1 text-sm"><span>Period end</span><input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded border bg-background px-2 py-1" /></label>
        <label className="grid gap-1 text-sm"><span>Grain</span><select aria-label="Analytics grain" value={grain} onChange={(event) => setGrain(event.target.value as typeof grain)} className="rounded border bg-background px-2 py-1"><option value="platform">Platform</option><option value="society">Society</option><option value="content">Content</option></select></label>
      </div>
      {cancelMutation.isError ? <p role="alert" className="text-sm text-destructive">{cancelMutation.error instanceof Error ? cancelMutation.error.message : "Unable to cancel the refresh."}</p> : null}
      {cancelMessage ? <p role="status" className="text-sm text-muted-foreground">{cancelMessage}</p> : null}
      {refreshMutation.isError ? <p role="alert" className="text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "Unable to refresh analytics."}</p> : null}
      {refreshWarnings.map((warning) => <p key={warning} role="status" className="text-sm text-amber-700 dark:text-amber-300">Warning: {warning}</p>)}
      {currentStatus?.status === "failed" && currentStatus.lastError ? <p role="alert" className="text-sm text-destructive">Refresh failed: {currentStatus.lastError}</p> : null}
      {actionQuery.isLoading ? <Skeleton className="h-40" /> : actionQuery.isError ? <p role="alert" className="text-sm text-destructive">Unable to load action analytics.</p> : metrics.length === 0 ? <MetricCardEmpty title="Action analytics" /> : <ActionActivitySummary metrics={metrics} />}
      {metrics.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-sm">Thread reactions</CardTitle>
                </div>
                <MetricTooltip
                  label="Thread reactions"
                  explanation="Aggregated reaction volume (likes and dislikes added or removed) specifically on thread posts."
                />
              </div>
              <CardDescription>Likes/dislikes added, removed, and score delta</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Likes added {metrics.reduce((sum, metric) => sum + (metric.targetType === "thread" ? numberValue(metric.data, "likesAdded") : 0), 0)} · Likes removed {metrics.reduce((sum, metric) => sum + (metric.targetType === "thread" ? numberValue(metric.data, "likesRemoved") : 0), 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-sm">Comment reactions</CardTitle>
                </div>
                <MetricTooltip
                  label="Comment reactions"
                  explanation="Aggregated reaction volume (likes and dislikes added or removed) specifically on comments."
                />
              </div>
              <CardDescription>Likes/dislikes added, removed, and score delta</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Likes added {metrics.reduce((sum, metric) => sum + (metric.targetType === "comment" ? numberValue(metric.data, "likesAdded") : 0), 0)} · Likes removed {metrics.reduce((sum, metric) => sum + (metric.targetType === "comment" ? numberValue(metric.data, "likesRemoved") : 0), 0)}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {currentState.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-sm">Current-state balances</CardTitle>
              </div>
              <MetricTooltip
                label="Current-state balances"
                explanation="Authoritative reaction balance snapshot read directly from the PostgreSQL database, separate from the action event stream."
              />
            </div>
            <CardDescription>Authoritative RDS snapshot, separate from activity</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {currentState.map((metric) => (
              <div key={metric.id}>
                <span className="text-muted-foreground">{metric.targetType ?? metric.grain} reactions</span>
                <strong className="block">{numberValue(metric.data, "reactionScore")}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {reconciliation.length > 0 ? (
        <div role="alert" className="rounded border border-destructive/50 p-4 text-sm text-destructive">
          Reconciliation mismatch detected in {reconciliation.length} snapshot row(s).
        </div>
      ) : null}
    </section>
  );
}

export function AnalyticsSection() {
  return (
    <TooltipProvider delayDuration={150}>
      <ActionAnalyticsPanel />
    </TooltipProvider>
  );
}


function MetricCardEmpty({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-[120px] items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Activity className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">No data yet</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
