import { useQueries, useQuery } from "@tanstack/react-query"

import { fetchMediaUrl } from "./api"
import type { MediaUrl } from "./api"

export function useMediaUrl(mediaId: string | null | undefined) {
  return useQuery({
    queryKey: ["media", "url", mediaId],
    queryFn: () => fetchMediaUrl(mediaId as string),
    enabled: mediaId !== null && mediaId !== undefined && mediaId.length > 0,
  })
}

export function useMediaUrls(mediaIds: readonly string[] | null | undefined) {
  const ids = mediaIds ?? []
  return useQueries({
    queries: ids.map((mediaId) => ({
      queryKey: ["media", "url", mediaId],
      queryFn: () => fetchMediaUrl(mediaId),
      enabled: mediaId.length > 0,
    })),
    combine: (results) => {
      const urls: MediaUrl[] = []
      for (const result of results) {
        if (result.data !== undefined) urls.push(result.data)
      }
      const pending = results.some((result) => result.isPending)
      return { urls, pending }
    },
  })
}
