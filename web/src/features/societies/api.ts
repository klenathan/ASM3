import { request } from "../../lib/http";
import type {
  CreateThreadInput,
  MySociety,
  Society,
  SocietyMembership,
  SocietyPage,
  Thread,
  ThreadPage,
} from "./types";

export interface DiscoveryParams {
  readonly q?: string
  readonly cursor?: string
  readonly limit?: number
}

export function fetchSocietyPage(params: DiscoveryParams = {}): Promise<SocietyPage> {
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.cursor !== undefined) search.set("cursor", params.cursor)
  if (params.q !== undefined && params.q.trim() !== "") search.set("q", params.q.trim())
  const query = search.toString()
  return request<SocietyPage>(`/api/v1/societies${query === "" ? "" : `?${query}`}`)
}

export function fetchSociety(slug: string): Promise<Society> {
  return request<Society>(`/api/v1/societies/${encodeURIComponent(slug)}`)
}

export function fetchMySocieties(): Promise<MySociety[]> {
  return request<MySociety[]>("/api/v1/me/societies")
}

export function fetchSocietyThreads(
  slug: string,
  cursor?: string,
): Promise<ThreadPage> {
  const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`
  return request<ThreadPage>(`/api/v1/societies/${encodeURIComponent(slug)}/threads${query}`)
}

export function createSocietyThread(
  slug: string,
  input: CreateThreadInput,
): Promise<Thread> {
  return request<Thread>(`/api/v1/societies/${encodeURIComponent(slug)}/threads`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function fetchMembership(slug: string): Promise<SocietyMembership | null> {
  return request<SocietyMembership | null>(`/api/v1/societies/${encodeURIComponent(slug)}/membership`)
}

export function joinSociety(slug: string): Promise<SocietyMembership> {
  return request<SocietyMembership>(`/api/v1/societies/${encodeURIComponent(slug)}/membership`, {
    method: "POST",
  })
}

export function leaveSociety(slug: string): Promise<void> {
  return request<void>(`/api/v1/societies/${encodeURIComponent(slug)}/membership`, {
    method: "DELETE",
  })
}
