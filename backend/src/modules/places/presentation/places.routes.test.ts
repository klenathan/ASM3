import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import { ApplicationError } from "../../../shared/domain/errors";
import type { PlacesPort } from "../application/places.port";
import { createPlacesController } from "./places.controller";
import { registerPlacesRoutes } from "./places.routes";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student" as const,
};

function makeApp(overrides: Partial<PlacesPort> = {}) {
  const placesPort: PlacesPort = {
    search: vi.fn(async () => [
      {
        mapboxId: "place.1",
        name: "RMIT University",
        placeType: "poi",
        address: "124 La Trobe Street",
        fullAddress: "124 La Trobe Street, Melbourne VIC",
      },
    ]),
    retrieve: vi.fn(async () => ({
      mapboxId: "place.1",
      name: "RMIT University",
      placeType: "poi",
      latitude: -37.808,
      longitude: 144.963,
      address: { city: "Melbourne" },
      meta: null,
    })),
    reverse: vi.fn(async (latitude, longitude) => ({
      latitude,
      longitude,
      address: { city: "Melbourne" },
      name: "RMIT University",
    })),
    ...overrides,
  };
  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerPlacesRoutes(app, createPlacesController({ placesPort }));
  return { app, placesPort };
}

describe("places HTTP routes", () => {
  it("searches places and forwards query options", async () => {
    const { app, placesPort } = makeApp();

    const response = await app.request(
      "/api/v1/places/search?q=RMIT%20University&proximity=144.96,-37.80&session_token=token-1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ suggestions: [{ mapboxId: "place.1" }] });
    expect(placesPort.search).toHaveBeenCalledWith(
      "RMIT University",
      "144.96,-37.80",
      "token-1",
    );
  });

  it("rejects invalid search queries before calling Mapbox", async () => {
    const { app, placesPort } = makeApp();

    const response = await app.request("/api/v1/places/search?q=x");

    expect(response.status).toBe(400);
    expect(placesPort.search).not.toHaveBeenCalled();
  });

  it("retrieves details and reverse geocodes coordinates", async () => {
    const { app, placesPort } = makeApp();

    const retrieve = await app.request("/api/v1/places/retrieve/place.1?session_token=token-2");
    expect(retrieve.status).toBe(200);
    await expect(retrieve.json()).resolves.toMatchObject({ mapboxId: "place.1" });
    expect(placesPort.retrieve).toHaveBeenCalledWith("place.1", "token-2");

    const reverse = await app.request("/api/v1/places/reverse?lat=-37.808&lng=144.963");
    expect(reverse.status).toBe(200);
    await expect(reverse.json()).resolves.toMatchObject({
      latitude: -37.808,
      longitude: 144.963,
    });
    expect(placesPort.reverse).toHaveBeenCalledWith(-37.808, 144.963);
  });

  it("maps rate limits and provider failures to stable API errors", async () => {
    const { app: rateLimited } = makeApp({ checkRateLimit: () => false });
    const limitedResponse = await rateLimited.request("/api/v1/places/search?q=RMIT");
    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });

    const { app: unavailable } = makeApp({
      search: vi.fn(async () => {
        throw new ApplicationError("PLACES_UNAVAILABLE", "Provider unavailable");
      }),
    });
    const unavailableResponse = await unavailable.request("/api/v1/places/search?q=RMIT");
    expect(unavailableResponse.status).toBe(503);
    await expect(unavailableResponse.json()).resolves.toMatchObject({
      error: { code: "PLACES_UNAVAILABLE" },
    });
  });
});
