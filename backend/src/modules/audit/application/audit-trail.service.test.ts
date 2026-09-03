import { describe, expect, it, vi } from "vitest";

import type { IdentityAccountRecord } from "../../identity/domain/identity.types";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { AuditEventRepository } from "./audit-events.repository";
import { AuditTrailService } from "./audit-trail.service";

const admin: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "system_admin",
};
const student: RequestPrincipal = {
  userId: "00000000-0000-4000-8000-000000000002",
  platformRole: "student",
};

function account(principal: RequestPrincipal): IdentityAccountRecord {
  return {
    user: { id: principal.userId, email: `${principal.userId}@rmit.edu.au`, createdAt: new Date("2026-01-01") },
    profile: {
      userId: principal.userId,
      displayName: "Test user",
      bio: null,
      avatarMediaId: null,
      platformRole: principal.platformRole,
      status: "active",
      isPublic: true,
      suspendedUntil: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
  };
}

describe("AuditTrailService", () => {
  it("allows system admins to read the paginated audit trail", async () => {
    const repository: AuditEventRepository = {
      record: vi.fn(),
      list: vi.fn(async (page) => ({ items: [], nextCursor: null, hasMore: false, page } as never)),
    };
    const service = new AuditTrailService({
      repository,
      accountReader: { findAccountByUserId: async () => account(admin) },
    });

    await expect(service.listEvents(admin, { limit: 250 })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(repository.list).toHaveBeenCalledWith({ limit: 100 });
  });

  it("rejects non-administrators before reading audit data", async () => {
    const list = vi.fn();
    const service = new AuditTrailService({
      repository: { record: vi.fn(), list } as unknown as AuditEventRepository,
      accountReader: { findAccountByUserId: async () => account(student) },
    });

    await expect(service.listEvents(student, { limit: 20 })).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
    expect(list).not.toHaveBeenCalled();
  });
});
