import { request } from "../../lib/http";

export type DatabaseState = "ok" | "degraded";

export interface HealthSnapshot {
  readonly status: "ok";
  readonly database: DatabaseState;
  readonly uptimeSeconds: number;
  readonly serverTime: string;
}

export function fetchHealth(): Promise<HealthSnapshot> {
  return request<HealthSnapshot>("/api/v1/admin/health");
}
