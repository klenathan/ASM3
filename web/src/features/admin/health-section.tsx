import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

import { fetchHealth } from "./health-api";

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatServerTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      });
}

function databaseBadge(state: "ok" | "degraded") {
  return state === "ok" ? (
    <Badge variant="secondary">OK</Badge>
  ) : (
    <Badge variant="outline" className="text-destructive">
      Degraded
    </Badge>
  );
}

function HealthRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-sm font-medium">{children}</dd>
    </div>
  );
}

export function HealthSection() {
  const query = useQuery({
    queryKey: ["admin", "health"],
    queryFn: fetchHealth,
  });

  return (
    <section aria-labelledby="health-heading">
      <h2
        id="health-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        System health
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Platform health and connectivity at a glance.
      </p>

      <div className="mt-6 flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            aria-hidden="true"
            className={query.isFetching ? "animate-spin" : undefined}
          />
          Refresh
        </Button>
      </div>

      <div className="mt-2 border bg-card">
        {query.isLoading ? (
          <div className="space-y-3 p-4" aria-label="Loading system health">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <p role="alert" className="text-sm text-destructive">
              {query.error?.message}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void query.refetch()}
              className="mt-4"
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : query.data ? (
          <dl className="divide-y divide-foreground/10">
            <HealthRow label="Status">
              {query.data.status === "ok" ? (
                <Badge>OK</Badge>
              ) : (
                <Badge variant="outline">{query.data.status}</Badge>
              )}
            </HealthRow>
            <HealthRow label="Database">{databaseBadge(query.data.database)}</HealthRow>
            <HealthRow label="Uptime">{formatUptime(query.data.uptimeSeconds)}</HealthRow>
            <HealthRow label="Server time">
              {formatServerTime(query.data.serverTime)}
            </HealthRow>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
