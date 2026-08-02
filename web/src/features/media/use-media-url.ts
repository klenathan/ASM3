import { useQuery } from "@tanstack/react-query"

import { fetchMediaUrl } from "./api"

export function useMediaUrl(mediaId: string | null | undefined) {
  return useQuery({
    queryKey: ["media", "url", mediaId],
    queryFn: () => fetchMediaUrl(mediaId as string),
    enabled: mediaId !== null && mediaId !== undefined && mediaId.length > 0,
  })
}
