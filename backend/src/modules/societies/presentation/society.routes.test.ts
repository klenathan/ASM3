import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";

import type { AppEnvironment } from "../../../app-types";
import type { MembershipService } from "../application/membership.service";
import type { SocietyService } from "../application/society.service";
import { registerSocietyRoutes } from "./society.routes";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "system_admin" as const,
};
const societyId = "00000000-0000-4000-8000-000000000010";
const avatarMediaId = "00000000-0000-4000-8000-000000000020";
const ruleId = "00000000-0000-4000-8000-000000000030";

function makeApp() {
  const societyService = {
    discover: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    createSociety: vi.fn(async () => ({ id: societyId, slug: "cloud" })),
    getSociety: vi.fn(async () => ({ id: societyId, slug: "cloud" })),
    listMySocieties: vi.fn(async () => []),
    listRules: vi.fn(async () => []),
    getRule: vi.fn(async () => ({ id: ruleId })),
    createRule: vi.fn(async () => ({ id: ruleId, position: 1 })),
    updateRule: vi.fn(async () => ({ id: ruleId, position: 1 })),
    deleteRule: vi.fn(async () => undefined),
  };
  const membershipService = {
    getMembership: vi.fn(async () => null),
    join: vi.fn(async () => ({ societyId, userId: principal.userId, status: "active" })),
    leave: vi.fn(async () => undefined),
    addModerator: vi.fn(async () => ({ societyId, userId: principal.userId, role: "moderator" })),
    removeModerator: vi.fn(async () => ({ societyId, userId: principal.userId, role: "member" })),
  };

  const app = new OpenAPIHono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("principal", principal);
    await next();
  });
  registerSocietyRoutes(app, {
    societyService: societyService as unknown as SocietyService,
    membershipService: membershipService as unknown as MembershipService,
  });
  return { app, societyService, membershipService };
}

describe("society HTTP routes", () => {
  it("discovers societies and creates one for the authenticated administrator", async () => {
    const { app, societyService } = makeApp();

    const discover = await app.request("/api/v1/societies?q=cloud&limit=10");
    expect(discover.status).toBe(200);
    expect(societyService.discover).toHaveBeenCalledWith(
      { limit: 10, q: "cloud" },
      principal,
    );

    const create = await app.request("/api/v1/societies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "cloud",
        name: "Cloud Computing",
        description: "Cloud students",
        avatarMediaId,
      }),
    });
    expect(create.status).toBe(201);
    expect(societyService.createSociety).toHaveBeenCalledWith(principal, {
      slug: "cloud",
      name: "Cloud Computing",
      description: "Cloud students",
      avatarMediaId,
    });
  });

  it("joins and leaves a society through membership routes", async () => {
    const { app, membershipService } = makeApp();

    const joined = await app.request("/api/v1/societies/cloud/membership", { method: "POST" });
    expect(joined.status).toBe(200);
    expect(membershipService.join).toHaveBeenCalledWith(principal, "cloud");

    const left = await app.request("/api/v1/societies/cloud/membership", { method: "DELETE" });
    expect(left.status).toBe(204);
    expect(membershipService.leave).toHaveBeenCalledWith(principal, "cloud");
  });

  it("creates, updates, and deletes society rules", async () => {
    const { app, societyService } = makeApp();

    const created = await app.request("/api/v1/societies/cloud/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: 1, title: "Be respectful", description: "Keep it constructive" }),
    });
    expect(created.status).toBe(201);
    expect(societyService.createRule).toHaveBeenCalledWith(principal, "cloud", {
      position: 1,
      title: "Be respectful",
      description: "Keep it constructive",
    });

    const updated = await app.request(`/api/v1/societies/cloud/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(updated.status).toBe(200);
    expect(societyService.updateRule).toHaveBeenCalledWith(principal, "cloud", ruleId, {
      title: "Updated",
    });

    const deleted = await app.request(`/api/v1/societies/cloud/rules/${ruleId}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(societyService.deleteRule).toHaveBeenCalledWith(principal, "cloud", ruleId);
  });
});
