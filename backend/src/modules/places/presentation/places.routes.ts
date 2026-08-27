import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnvironment } from "../../../app-types";
import type { PlacesController } from "./places.controller";
import {
  placesSearchQuerySchema,
  placesReverseQuerySchema,
  placesSearchResponseSchema,
  placesRetrieveResponseSchema,
  placesReverseResponseSchema,
} from "./places.schemas";

export function registerPlacesRoutes(app: OpenAPIHono<AppEnvironment>, controller: PlacesController) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/places/search",
      request: { query: placesSearchQuerySchema },
      responses: {
        200: { content: { "application/json": { schema: placesSearchResponseSchema } }, description: "Search suggestions" },
        400: { content: { "application/json": { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.record(z.string(), z.unknown()) }) }) } }, description: "Validation error" },
        429: { content: { "application/json": { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.record(z.string(), z.unknown()) }) }) } }, description: "Rate limited" },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => controller.search(c) as any,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/places/retrieve/{mapboxId}",
      request: { params: z.object({ mapboxId: z.string() }), query: z.object({ session_token: z.string().optional() }) },
      responses: {
        200: { content: { "application/json": { schema: placesRetrieveResponseSchema } }, description: "Place details" },
        400: { content: { "application/json": { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.record(z.string(), z.unknown()) }) }) } }, description: "Not found" },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => controller.retrieve(c) as any,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/places/reverse",
      request: { query: placesReverseQuerySchema },
      responses: {
        200: { content: { "application/json": { schema: placesReverseResponseSchema } }, description: "Reverse geocode" },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => controller.reverse(c) as any,
  );
}
