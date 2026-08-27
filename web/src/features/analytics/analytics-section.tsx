import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

import { queryMetrics, refreshAnalytics } from "./analytics-api";
import type { UserGrowthData, ContentVolumeData, TopSocietiesData, ModerationData, MetricPayload } from "./analytics-api";

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

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

function UserGrowthChart({ data }: { data: UserGrowthData }) {
  const chartData = [
    { label: "Registrations", value: data.registrations },
    { label: "Active", value: data.activeUsers },
    { label: "Total", value: data.totalUsers },
    { label: "Suspended", value: data.suspensions },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">User Growth</CardTitle>
        <CardDescription>Platform-wide user metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <BarChart width={400} height={200} data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentVolumeChart({ data }: { data: ContentVolumeData }) {
  const chartData = [
    { label: "Threads", value: data.threads },
    { label: "Comments", value: data.comments },
    { label: "Votes", value: data.votes },
    { label: "Reports", value: data.reports },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Content Volume</CardTitle>
        <CardDescription>Platform-wide engagement metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <BarChart width={400} height={200} data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
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
              <BarChart width={400} height={150} data={byMembers.map((s) => ({ label: s.name || s.societyId.slice(0, 8), value: s.memberCount }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">By Threads</p>
            <div className="h-[150px]">
              <BarChart width={400} height={150} data={byThreads.map((s) => ({ label: s.name || s.societyId.slice(0, 8), value: s.threadCount }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModerationChart({ data }: { data: ModerationData }) {
  const pieData = [
    { name: "Pending", value: data.pendingReports },
    { name: "Resolved", value: data.totalReports - data.pendingReports },
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
          <PieChart width={200} height={200}>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((entry, idx) => (
                <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
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

  const refreshMutation = useMutation({
    mutationFn: refreshAnalytics,
    onSuccess: () => {
      // Refetch all metrics after a delay to allow pipeline to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["analytics"] });
      }, 60_000);
    },
  });

  const userGrowthData = userGrowthQuery.data?.metrics[0]?.data;
  const contentVolumeData = contentVolumeQuery.data?.metrics[0]?.data;
  const topSocietiesData = topSocietiesQuery.data?.metrics[0]?.data;
  const moderationData = moderationQuery.data?.metrics[0]?.data;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Platform-wide usage metrics computed nightly via the EMR pipeline.
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {userGrowthQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : userGrowthData && isUserGrowth(userGrowthData) ? (
          <UserGrowthChart data={userGrowthData} />
        ) : (
          <MetricCardEmpty title="User Growth" />
        )}

        {contentVolumeQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : contentVolumeData && isContentVolume(contentVolumeData) ? (
          <ContentVolumeChart data={contentVolumeData} />
        ) : (
          <MetricCardEmpty title="Content Volume" />
        )}

        {topSocietiesQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : topSocietiesData && isTopSocieties(topSocietiesData) ? (
          <TopSocietiesChart data={topSocietiesData} />
        ) : (
          <MetricCardEmpty title="Top Societies" />
        )}

        {moderationQuery.isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : moderationData && isModeration(moderationData) ? (
          <ModerationChart data={moderationData} />
        ) : (
          <MetricCardEmpty title="Moderation" />
        )}
      </div>
    </div>
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