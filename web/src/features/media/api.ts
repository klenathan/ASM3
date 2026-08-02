import { request } from "../../lib/http"

export interface MediaUrl {
  readonly mediaId: string
  readonly url: string
}

export function fetchMediaUrl(mediaId: string): Promise<MediaUrl> {
  return request<MediaUrl>(`/api/v1/media/${encodeURIComponent(mediaId)}/url`)
}
