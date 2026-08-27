import { z } from "@hono/zod-openapi";

export const placesSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    proximity: z.string().trim().optional(),
    session_token: z.string().trim().optional(),
  })
  .openapi("PlacesSearchQuery");

export const placesReverseQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .openapi("PlacesReverseQuery");

export const placeSuggestionSchema = z.object({
  mapboxId: z.string(),
  name: z.string(),
  placeType: z.string().nullable(),
  address: z.string().nullable(),
  fullAddress: z.string().nullable().optional(),
});

export const placesSearchResponseSchema = z
  .object({ suggestions: z.array(placeSuggestionSchema) })
  .openapi("PlacesSearchResponse");

export const placeDetailsSchema = z.object({
  mapboxId: z.string(),
  name: z.string(),
  placeType: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.record(z.string(), z.unknown()).nullable(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const placesRetrieveResponseSchema = placeDetailsSchema.openapi("PlacesRetrieveResponse");

export const placesReverseResponseSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.record(z.string(), z.unknown()).nullable(),
    name: z.string().nullable(),
  })
  .openapi("PlacesReverseResponse");
