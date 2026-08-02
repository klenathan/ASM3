import { request } from "../../lib/http"
import type { HomeFeedPage } from "./types"

export function fetchHomeFeed(cursor?: string, limit = 20): Promise<HomeFeedPage> {
  const search = new URLSearchParams()
  search.set('limit', String(limit))
  if (cursor !== undefined) search.set('cursor', cursor)
  return request<HomeFeedPage>(`/api/v1/feed?${search.toString()}`)
}
