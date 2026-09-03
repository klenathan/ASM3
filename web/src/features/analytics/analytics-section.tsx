import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../../components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../components/ui/chart";

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
  getActionAnalyticsRefreshStatus,
  getAnalyticsRefreshStatus,
  queryActionMetrics,
  refreshActionAnalytics,
  queryMetrics,
  refreshAnalytics,
} from "./analytics-api";
import type {
  ActionMetric,
  AnalyticsPage,
  ContentVolumeData,
  MetricPayload,
  ModerationData,
  RefreshRun,
  RefreshStatus,
  TopSocietiesData,
  UserGrowthData,
} from "./analytics-api";

const USER_GROWTH_CHART_CONFIG = {
  value: { label: "Users", color: "var(--chart-1)" },
  registrations: { label: "Registrations", color: "var(--chart-1)" },
  active: { label: "Active", color: "var(--chart-3)" },
  total: { label: "Total", color: "var(--chart-4)" },
  suspended: { label: "Suspended", color: "var(--destructive)" },
} satisfies ChartConfig;

const CONTENT_VOLUME_CHART_CONFIG = {
  value: { label: "Activity", color: "var(--chart-1)" },
  threads: { label: "Threads", color: "var(--chart-1)" },
  comments: { label: "Comments", color: "var(--chart-4)" },
  votes: { label: "Votes", color: "var(--signal)" },
  reports: { label: "Reports", color: "var(--destructive)" },
} satisfies ChartConfig;

const MEMBERS_CHART_CONFIG = {
  value: { label: "Members", color: "var(--chart-1)" },
} satisfies ChartConfig;

const THREADS_CHART_CONFIG = {
  value: { label: "Threads", color: "var(--signal)" },
} satisfies ChartConfig;

const MODERATION_CHART_CONFIG = {
  value: { label: "Reports", color: "var(--chart-3)" },
  pending: { label: "Pending", color: "var(--signal)" },
  resolved: { label: "Resolved", color: "var(--chart-3)" },
} satisfies ChartConfig;

function isUserGrowth(data: MetricPayload): data is UserGrowthData {
  return "registrations" in data;
}

function isContentVolume(data: MetricPayload): data is ContentVolumeData {
  return "threads" in data && "comments" in data;
}

function isTopSocieties(data: MetricPayload): data is TopSocietiesData {
  return "topByMembers" in data;
}

function isModeration(data: MetricPayload): data is ModerationData {
  return "pendingReports" in data;
}

function platformMetricData(page: AnalyticsPage | undefined): MetricPayload | undefined {
  return page?.metrics.find((metric) => metric.societyId === null)?.data;
}

const REFRESH_STATUS_LABEL: Record<RefreshStatus, string> = {
  requested: "Queued",
  exporting: "Exporting snapshot",
  querying: "Running metrics",
  completed: "Completed",
  failed: "Failed",
};

function refreshStatusVariant(status: RefreshStatus): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "default";
  return "secondary";
}


function UserGrowthChart({ data }: { data: UserGrowthData }) {
  const chartData = [
    { label: "Registrations", value: data.registrations, color: "var(--color-registrations)" },
    { label: "Active", value: data.activeUsers, color: "var(--color-active)" },
    { label: "Total", value: data.totalUsers, color: "var(--color-total)" },
    { label: "Suspended", value: data.suspensions, color: "var(--color-suspended)" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">User Growth</CardTitle>
        <CardDescription>Platform-wide user metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ChartContainer
            config={USER_GROWTH_CHART_CONFIG}
            className="h-full w-full aspect-auto"
            role="img"
            aria-label="User growth metrics bar chart"
          >
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentVolumeChart({ data }: { data: ContentVolumeData }) {
  const chartData = [
    { label: "Threads", value: data.threads, color: "var(--color-threads)" },
    { label: "Comments", value: data.comments, color: "var(--color-comments)" },
    { label: "Votes", value: data.votes, color: "var(--color-votes)" },
    { label: "Reports", value: data.reports, color: "var(--color-reports)" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Content Volume</CardTitle>
        <CardDescription>Platform-wide engagement metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ChartContainer
            config={CONTENT_VOLUME_CHART_CONFIG}
            className="h-full w-full aspect-auto"
            role="img"
            aria-label="Content volume metrics bar chart"
          >
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function TopSocietiesChart({ data }: { data: TopSocietiesData }) {
  const byMembers = data.topByMembers.slice(0, 5);
  const byThreads = data.topByThreads.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Top Societies</CardTitle>
        <CardDescription>By members and activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">By Members</p>
            <div className="h-[150px]">
              <ChartContainer
                config={MEMBERS_CHART_CONFIG}
                className="h-full w-full aspect-auto"
                role="img"
                aria-label="Top societies by member count bar chart"
              >
                <BarChart
                  accessibilityLayer
                  data={byMembers.map((s) => ({
                    label: s.name || s.societyId.slice(0, 8),
                    value: s.memberCount,
                  }))}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis fontSize={10} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">By Threads</p>
            <div className="h-[150px]">
              <ChartContainer
                config={THREADS_CHART_CONFIG}
                className="h-full w-full aspect-auto"
                role="img"
                aria-label="Top societies by thread count bar chart"
              >
                <BarChart
                  accessibilityLayer
                  data={byThreads.map((s) => ({
                    label: s.name || s.societyId.slice(0, 8),
                    value: s.threadCount,
                  }))}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis fontSize={10} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function ModerationChart({ data }: { data: ModerationData }) {
  const pieData = [
    { name: "Pending", value: data.pendingReports, color: "var(--color-pending)" },
    {
      name: "Resolved",
      value: Math.max(data.totalReports - data.pendingReports, 0),
      color: "var(--color-resolved)",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Moderation</CardTitle>
        <CardDescription>
          {data.pendingReports} pending · {data.totalReports} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-[200px] items-center justify-center">
          <ChartContainer
            config={MODERATION_CHART_CONFIG}
            className="h-full w-full aspect-auto"
            role="img"
            aria-label="Moderation report status donut chart"
          >
            <PieChart accessibilityLayer>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
          {pieData.map((entry) => (
            <div key={entry.name}>
              <div className="mb-1 flex items-center justify-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium text-foreground">{entry.name}</span>
              </div>
              <p>{entry.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">{data.avgResolutionHours.toFixed(1)}h</p>
            <p>Avg resolution</p>
          </div>
          <div>
            <p className="font-medium text-foreground">{data.resolvedToday}</p>
            <p>Resolved today</p>
          </div>
        </div>
      </CardContent>
    </Card>
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

function ActionActivitySummary({ metrics }: { metrics: ActionMetric[] }) {
  const activity = metrics.filter((metric) => metric.metricKind === "activity");
  const totals = activity.reduce<Record<string, number>>((result, metric) => {
    for (const key of [
      "likesAdded", "likesRemoved", "dislikesAdded", "dislikesRemoved",
      "reactionScoreDelta", "joins", "leaves", "activations", "bans", "distinctActors",
    ]) result[key] = (result[key] ?? 0) + numberValue(metric.data, key);
    return result;
  }, {});
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Action totals">
      {[
        ["Distinct actors", "distinctActors"],
        ["Likes added", "likesAdded"],
        ["Likes removed", "likesRemoved"],
        ["Dislikes added", "dislikesAdded"],
        ["Dislikes removed", "dislikesRemoved"],
        ["Reaction score delta", "reactionScoreDelta"],
        ["Joins", "joins"],
        ["Leaves", "leaves"],
        ["Activations", "activations"],
        ["Bans", "bans"],
      ].map(([label, key]) => (
        <Card key={key}>
          <CardHeader className="p-4"><CardDescription>{label}</CardDescription><CardTitle>{totals[key] ?? 0}</CardTitle></CardHeader>
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
  const actionQuery = useQuery({
    queryKey: ["analytics", "action-events", grain, periodStart, periodEnd],
    queryFn: () => queryActionMetrics({ grain, periodStart, periodEnd, limit: 100 }),
  });
  const statusQuery = useQuery({
    queryKey: ["analytics", "action-refresh-status", runId],
    queryFn: () => getActionAnalyticsRefreshStatus(runId as string),
    enabled: runId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "requested" || status === "exporting" || status === "querying" ? 5_000 : false;
    },
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshActionAnalytics(periodStart, periodEnd),
    onSuccess: (result) => {
      setRefreshWarnings(result.warnings ?? []);
      if (result.runId) setRunId(result.runId);
      void queryClient.invalidateQueries({ queryKey: ["analytics", "action-events"] });
    },
  });
  const active = statusQuery.data?.status === "requested" || statusQuery.data?.status === "exporting" || statusQuery.data?.status === "querying";
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
        <Button type="button" onClick={() => { setRefreshWarnings([]); refreshMutation.mutate(); }} disabled={active || refreshMutation.isPending}>
          <RefreshCw className={refreshMutation.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {active ? "Refresh in progress" : statusQuery.data?.status === "failed" ? "Retry refresh" : "Refresh analytics"}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Period start<input aria-label="Period start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="rounded border bg-background px-2 py-1" /></label>
        <label className="grid gap-1 text-sm">Period end<input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded border bg-background px-2 py-1" /></label>
        <label className="grid gap-1 text-sm">Grain<select aria-label="Analytics grain" value={grain} onChange={(event) => setGrain(event.target.value as typeof grain)} className="rounded border bg-background px-2 py-1"><option value="platform">Platform</option><option value="society">Society</option><option value="content">Content</option></select></label>
      </div>
      {refreshMutation.isError ? <p role="alert" className="text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "Unable to refresh analytics."}</p> : null}
      {refreshWarnings.map((warning) => <p key={warning} role="status" className="text-sm text-amber-700 dark:text-amber-300">Warning: {warning}</p>)}
      {statusQuery.data?.status === "failed" && statusQuery.data.lastError ? <p role="alert" className="text-sm text-destructive">Refresh failed: {statusQuery.data.lastError}</p> : null}
      {actionQuery.isLoading ? <Skeleton className="h-40" /> : actionQuery.isError ? <p role="alert" className="text-sm text-destructive">Unable to load action analytics.</p> : metrics.length === 0 ? <MetricCardEmpty title="Action analytics" /> : <ActionActivitySummary metrics={metrics} />}
      {metrics.length > 0 ? <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">Thread reactions</CardTitle><CardDescription>Likes/dislikes added, removed, and score delta</CardDescription></CardHeader><CardContent className="text-sm">Likes added {metrics.reduce((sum, metric) => sum + (metric.targetType === "thread" ? numberValue(metric.data, "likesAdded") : 0), 0)} · Likes removed {metrics.reduce((sum, metric) => sum + (metric.targetType === "thread" ? numberValue(metric.data, "likesRemoved") : 0), 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Comment reactions</CardTitle><CardDescription>Likes/dislikes added, removed, and score delta</CardDescription></CardHeader><CardContent className="text-sm">Likes added {metrics.reduce((sum, metric) => sum + (metric.targetType === "comment" ? numberValue(metric.data, "likesAdded") : 0), 0)} · Likes removed {metrics.reduce((sum, metric) => sum + (metric.targetType === "comment" ? numberValue(metric.data, "likesRemoved") : 0), 0)}</CardContent></Card>
      </div> : null}
      {currentState.length > 0 ? <Card><CardHeader><CardTitle className="text-sm">Current-state balances</CardTitle><CardDescription>Authoritative RDS snapshot, separate from activity</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">{currentState.map((metric) => <div key={metric.id}><span className="text-muted-foreground">{metric.targetType ?? metric.grain} reactions</span><strong className="block">{numberValue(metric.data, "reactionScore")}</strong></div>)}</CardContent></Card> : null}
      {reconciliation.length > 0 ? <div role="alert" className="rounded border border-destructive/50 p-4 text-sm text-destructive">Reconciliation mismatch detected in {reconciliation.length} snapshot row(s).</div> : null}
      <details><summary className="cursor-pointer font-medium">Historical snapshot baseline</summary><p className="mt-2 text-sm text-muted-foreground">Historical snapshot baseline — not reconstructed action history</p></details>
    </section>
  );
}

export function AnalyticsSection() {
  const queryClient = useQueryClient();

  const userGrowthQuery = useQuery({
    queryKey: ["analytics", "user_growth"],
    queryFn: () => queryMetrics({ metricType: "user_growth" }),
    refetchInterval: 30_000,
  });

  const contentVolumeQuery = useQuery({
    queryKey: ["analytics", "content_volume"],
    queryFn: () => queryMetrics({ metricType: "content_volume" }),
    refetchInterval: 30_000,
  });

  const topSocietiesQuery = useQuery({
    queryKey: ["analytics", "top_societies"],
    queryFn: () => queryMetrics({ metricType: "top_societies" }),
    refetchInterval: 30_000,
  });

  const moderationQuery = useQuery({
    queryKey: ["analytics", "moderation"],
    queryFn: () => queryMetrics({ metricType: "moderation" }),
    refetchInterval: 30_000,
  });

  const refreshStatusQuery = useQuery<RefreshRun | null>({
    queryKey: ["analytics", "refresh-status"],
    queryFn: getAnalyticsRefreshStatus,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "requested" || status === "exporting" || status === "querying"
        ? 5_000
        : false;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: refreshAnalytics,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics", "refresh-status"] });
    },
  });

  const userGrowthData = platformMetricData(userGrowthQuery.data);
  const contentVolumeData = platformMetricData(contentVolumeQuery.data);
  const topSocietiesData = platformMetricData(topSocietiesQuery.data);
  const moderationData = platformMetricData(moderationQuery.data);

  return (
    <div>
      <ActionAnalyticsPanel />
      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">Historical snapshot baseline</summary>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Platform-wide usage metrics computed nightly through Glue and Athena.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`}
            />
            {refreshMutation.isPending ? "Refreshing…" : "Refresh Analytics"}
          </Button>
        </div>
        {refreshMutation.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {refreshMutation.error instanceof Error && refreshMutation.error.message
              ? refreshMutation.error.message
              : "Unable to refresh analytics. Try again."}
          </p>
        ) : null}
        {refreshStatusQuery.data ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
            <span className="text-muted-foreground">Latest refresh:</span>
            <Badge variant={refreshStatusVariant(refreshStatusQuery.data.status)}>
              {REFRESH_STATUS_LABEL[refreshStatusQuery.data.status]}
            </Badge>
            {refreshStatusQuery.data.status === "failed" && refreshStatusQuery.data.lastError ? (
              <span className="text-destructive">{refreshStatusQuery.data.lastError}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {userGrowthQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : userGrowthQuery.isError ? (
          <MetricCardError
            title="User Growth"
            error={userGrowthQuery.error}
            onRetry={() => void userGrowthQuery.refetch()}
            isRetrying={userGrowthQuery.isFetching}
          />
        ) : userGrowthData && isUserGrowth(userGrowthData) ? (
          <UserGrowthChart data={userGrowthData} />
        ) : (
          <MetricCardEmpty title="User Growth" />
        )}

        {contentVolumeQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : contentVolumeQuery.isError ? (
          <MetricCardError
            title="Content Volume"
            error={contentVolumeQuery.error}
            onRetry={() => void contentVolumeQuery.refetch()}
            isRetrying={contentVolumeQuery.isFetching}
          />
        ) : contentVolumeData && isContentVolume(contentVolumeData) ? (
          <ContentVolumeChart data={contentVolumeData} />
        ) : (
          <MetricCardEmpty title="Content Volume" />
        )}

        {topSocietiesQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : topSocietiesQuery.isError ? (
          <MetricCardError
            title="Top Societies"
            error={topSocietiesQuery.error}
            onRetry={() => void topSocietiesQuery.refetch()}
            isRetrying={topSocietiesQuery.isFetching}
          />
        ) : topSocietiesData && isTopSocieties(topSocietiesData) ? (
          <TopSocietiesChart data={topSocietiesData} />
        ) : (
          <MetricCardEmpty title="Top Societies" />
        )}

        {moderationQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : moderationQuery.isError ? (
          <MetricCardError
            title="Moderation"
            error={moderationQuery.error}
            onRetry={() => void moderationQuery.refetch()}
            isRetrying={moderationQuery.isFetching}
          />
        ) : moderationData && isModeration(moderationData) ? (
          <ModerationChart data={moderationData} />
        ) : (
          <MetricCardEmpty title="Moderation" />
        )}
      </div>
</details>
    </div>
  );
}


function MetricCardError({
  title,
  error,
  onRetry,
  isRetrying,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-[200px] flex-col items-center justify-center gap-3">
          <p role="alert" className="text-center text-sm text-destructive">
            {error instanceof Error && error.message
              ? error.message
              : "Unable to load analytics. Try again."}
          </p>
          <Button type="button" variant="outline" onClick={onRetry} disabled={isRetrying}>
            <RefreshCw aria-hidden="true" className={isRetrying ? "animate-spin" : undefined} />
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCardEmpty({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <BarChart3 className="h-8 w-8" />
            <p className="text-sm">No data yet</p>
            <p className="text-xs text-muted-foreground">
              Run the analytics pipeline to populate metrics.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}