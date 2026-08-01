import { getAuthToken } from "./token";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

function messageFromDetail(status: number, detail: unknown): string {
  if (typeof detail === "string" && detail.trim() !== "") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const msg = (item as { msg?: unknown }).msg;
        return typeof msg === "string" && msg.trim() !== "" ? msg : null;
      })
      .filter((part): part is string => part !== null);
    if (parts.length > 0) return parts.join(" ");
  }
  if (detail && typeof detail === "object") {
    const fallback = (detail as { message?: string }).message;
    if (typeof fallback === "string" && fallback.trim() !== "")
      return fallback;
  }
  return `Request failed (${status})`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(messageFromDetail(status, detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  { method = "GET", body, signal }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (isJson && payload && typeof payload === "object") {
      const detail = (payload as { detail?: unknown }).detail;
      throw new ApiError(response.status, detail ?? payload);
    }
    throw new ApiError(response.status, `Request failed (${response.status})`);
  }

  return payload as T;
}

export const api = {
  get<T>(path: string, signal?: AbortSignal) {
    return request<T>(path, { signal });
  },
  post<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: "POST", body, signal });
  },
  patch<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: "PATCH", body, signal });
  },
  put<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, { method: "PUT", body, signal });
  },
  delete<T>(path: string, signal?: AbortSignal) {
    return request<T>(path, { method: "DELETE", signal });
  },
};
