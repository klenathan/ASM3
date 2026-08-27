import { useQuery } from "@tanstack/react-query";
import { searchPlaces } from "./api";

export function usePlacesSearch(query: string, proximity: string | null, sessionToken: string | null) {
  return useQuery({
    queryKey: ["places", "search", query, proximity, sessionToken],
    queryFn: () => searchPlaces(query, proximity, sessionToken),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
}
