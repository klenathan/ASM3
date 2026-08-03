import { request } from "../../lib/http";

export interface ConfigItem {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: string;
}

export interface ConfigPage {
  readonly items: ConfigItem[];
}

export function fetchPlatformConfig(): Promise<ConfigPage> {
  return request<ConfigPage>("/api/v1/admin/config");
}

export function updatePlatformConfig(key: string, value: string): Promise<ConfigItem> {
  return request<ConfigItem>(`/api/v1/admin/config/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
