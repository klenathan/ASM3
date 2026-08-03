export interface PlatformConfigDto {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: string | null;
}

export interface PlatformHealthDto {
  readonly status: "ok";
  readonly database: "ok" | "degraded";
  readonly uptimeSeconds: number;
  readonly serverTime: string;
}
