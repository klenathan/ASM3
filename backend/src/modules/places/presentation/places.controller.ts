import type { Context } from "hono";
import { ApplicationError } from "../../../shared/domain/errors";
import type { AppEnvironment } from "../../../app-types";
import type { PlacesPort } from "../application/places.port";
import { requireInjectedPrincipal } from "../../discussions/presentation/discussion.http.helpers";

interface PlacesControllerDeps {
  placesPort: PlacesPort;
}

export function createPlacesController(deps: PlacesControllerDeps) {
  return {
    async search(context: Context<AppEnvironment>) {
      const principal = requireInjectedPrincipal(context);
      const query = context.req.query("q") ?? "";
      const prox = context.req.query("proximity") ?? null;
      const sessionToken = context.req.query("session_token") ?? null;

      if (deps.placesPort.checkRateLimit && !deps.placesPort.checkRateLimit(principal.userId)) {
        return context.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests", requestId: context.get("requestId"), details: {} } },
          429,
        );
      }

      if (query.trim().length < 2) {
        return context.json(
          { error: { code: "VALIDATION_ERROR", message: "Query must be at least 2 characters", requestId: context.get("requestId"), details: {} } },
          400,
        );
      }

      try {
        const suggestions = await deps.placesPort.search(query, prox, sessionToken);
        return context.json({ suggestions }, 200);
      } catch (error) {
        if (error instanceof ApplicationError && error.code === "PLACES_UNAVAILABLE") {
          return context.json({ error: { code: error.code, message: error.message, requestId: context.get("requestId"), details: {} } }, 503);
        }
        throw error;
      }
    },
    async retrieve(context: Context<AppEnvironment>) {
      const principal = requireInjectedPrincipal(context);
      const mapboxId = context.req.param("mapboxId") ?? "";
      const sessionToken = context.req.query("session_token") ?? null;
      if (!mapboxId) {
        return context.json({ error: { code: "VALIDATION_ERROR", message: "mapboxId is required", requestId: context.get("requestId"), details: {} } }, 400);
      }

      if (deps.placesPort.checkRateLimit && !deps.placesPort.checkRateLimit(principal.userId)) {
        return context.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests", requestId: context.get("requestId"), details: {} } },
          429,
        );
      }

      try {
        const details = await deps.placesPort.retrieve(mapboxId, sessionToken);
        return context.json(details, 200);
      } catch (error) {
        if (error instanceof ApplicationError) {
          const status = error.code === "LOCATION_NOT_FOUND" ? 400 : 503;
          return context.json({ error: { code: error.code, message: error.message, requestId: context.get("requestId"), details: {} } }, status as never);
        }
        throw error;
      }
    },
    async reverse(context: Context<AppEnvironment>) {
      const principal = requireInjectedPrincipal(context);
      const lat = Number(context.req.query("lat"));
      const lng = Number(context.req.query("lng"));
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return context.json({ error: { code: "VALIDATION_ERROR", message: "Invalid coordinates", requestId: context.get("requestId"), details: {} } }, 400);
      }

      if (deps.placesPort.checkRateLimit && !deps.placesPort.checkRateLimit(principal.userId)) {
        return context.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests", requestId: context.get("requestId"), details: {} } },
          429,
        );
      }

      try {
        const result = await deps.placesPort.reverse(lat, lng);
        return context.json(result, 200);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return context.json({ error: { code: error.code, message: error.message, requestId: context.get("requestId"), details: {} } }, 503 as never);
        }
        throw error;
      }
    },
  };
}

export type PlacesController = ReturnType<typeof createPlacesController>;
