import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

import { getAnalyticsRefreshStatus, queryMetrics, refreshAnalytics } from "./analytics-api";
import type {
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