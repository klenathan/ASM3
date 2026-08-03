import { describe, expect, it } from "vitest";

import type { IdentityAccountRecord, UserProfileRecord } from "./identity.types";
import { assertAccountUsable } from "./access.policy";

const now = new Date("2026-02-01T00:00:00.000Z");

function account(overrides: Partial<UserProfileRecord> = {}): IdentityAccountRecord {
  const profile: UserProfileRecord = {
    userId: "00000000-0000-4000-8000-000000000001",
    displayName: "Student",
    bio: null,
    avatarMediaId: null,
    platformRole: "student",
    status: "active",
    isPublic: true,
    suspendedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return { user: { id: profile.userId, email: "s@rmit.edu.au", createdAt: now }, profile };
}

describe("assertAccountUsable", () => {
  it("exposes the suspension end date when a dated suspension is active", () => {
    const suspensionEnd = new Date("2026-03-01T00:00:00.000Z");
    const record = account({ status: "suspended", suspendedUntil: suspensionEnd });

    try {
      assertAccountUsable(record, now);
      throw new Error("expected assertAccountUsable to reject");
    } catch (error) {
      expect(error).toMatchObject({
        code: "USER_SUSPENDED",
        details: { suspendedUntil: suspensionEnd.toISOString() },
      });
    }
  });

  it("reports an indefinite suspension with a null end date", () => {
    const record = account({ status: "suspended", suspendedUntil: null });

    try {
      assertAccountUsable(record, now);
      throw new Error("expected assertAccountUsable to reject");
    } catch (error) {
      expect(error).toMatchObject({
        code: "USER_SUSPENDED",
        details: { suspendedUntil: null },
      });
    }
  });

  it("allows an account whose suspension has already expired", () => {
    const record = account({ status: "suspended", suspendedUntil: new Date("2026-01-01T00:00:00.000Z") });

    expect(() => assertAccountUsable(record, now)).not.toThrow();
  });
});
