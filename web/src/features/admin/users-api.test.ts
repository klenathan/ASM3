import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateUser,
  deactivateUser,
  fetchAdminUsers,
  setUserRole,
  suspendUser,
  type AdminUser,
} from "./users-api";

const user: AdminUser = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "student@rmit.edu.au",
  displayName: "Nadia Tran",
  bio: null,
  avatarMediaId: null,
  platformRole: "student",
  status: "active",
  isPublic: true,
  suspendedUntil: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin users API", () => {
  it("lists users with search, status, and pagination params", async () => {
    const page = { items: [user], nextCursor: "abc", hasMore: false };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAdminUsers({ search: "nadia", status: "active", cursor: "abc", limit: 10 }),
    ).resolves.toEqual(page);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/users");
    expect(url).toContain("search=nadia");
    expect(url).toContain("status=active");
    expect(url).toContain("cursor=abc");
    expect(url).toContain("limit=10");
  });

  it("suspends a user with the suspend endpoint and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...user, status: "suspended" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const until = "2026-09-01T00:00:00.000Z";
    await expect(suspendUser(user.userId, until)).resolves.toMatchObject({
      status: "suspended",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/admin/users/${user.userId}/suspend`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ suspendedUntil: until });
  });

  it("sends null suspendedUntil when no end date is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...user, status: "suspended" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await suspendUser(user.userId, null);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ suspendedUntil: null });
  });

  it("sets a user role via PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...user, platformRole: "system_admin" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(setUserRole(user.userId, "system_admin")).resolves.toMatchObject({
      platformRole: "system_admin",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/admin/users/${user.userId}/role`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ platformRole: "system_admin" });
  });

  it("deactivates a user with no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...user, status: "deactivated" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deactivateUser(user.userId)).resolves.toMatchObject({
      status: "deactivated",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/admin/users/${user.userId}/deactivate`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("activates a user with no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...user, status: "active" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(activateUser(user.userId)).resolves.toMatchObject({
      status: "active",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/admin/users/${user.userId}/activate`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("propagates error codes such as ADMIN_REQUIRED on 403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "ADMIN_REQUIRED", message: "Admin only" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAdminUsers()).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
      status: 403,
    });
  });
});
