import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { IdentityAccountRecord } from "../../identity/domain/identity.types";
import type { PlatformConfigRecord } from "../domain/platform";
import { PlatformService } from "./platform.service";
import type {
  PlatformConfigRepository,
  UpsertPlatformConfigInput,
} from "./platform.repository";

const now = new Date("2026-03-01T00:00:00.000Z");
const clock: Clock = { now: () => now };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
const student: RequestPrincipal = { userId: "student-id", platformRole: "student" };

describe("PlatformService", () => {
  it("rejects non-system-admins with ADMIN_REQUIRED", async () => {
    const service = createService(new FakePlatformConfigRepository());
    await expect(service.listConfig(student)).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
    await expect(service.health(student)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    await expect(
      service.upsertConfig(student, "allowed_email_domains", "rmit.edu.au"),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });

  it("returns the default allowed_email_domains when nothing is configured", async () => {
    const repository = new FakePlatformConfigRepository();
    const service = createService(repository);

    const items = await service.listConfig(admin);
    expect(items).toEqual([
      {
        key: "allowed_email_domains",
        value: "rmit.edu.au,rmit.edu.vn,rmit.edu.eu,rmit.eu",
        updatedAt: null,
      },
    ]);
  });

  it("applies a stored value once configured and reports updatedAt", async () => {
    const repository = new FakePlatformConfigRepository();
    const service = createService(repository);

    const saved = await service.upsertConfig(admin, "allowed_email_domains", "rmit.edu.au");
    expect(saved).toMatchObject({
      key: "allowed_email_domains",
      value: "rmit.edu.au",
      updatedAt: now.toISOString(),
    });

    const items = await service.listConfig(admin);
    expect(items).toEqual([
      {
        key: "allowed_email_domains",
        value: "rmit.edu.au",
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it("reports a healthy database when reachable", async () => {
    const service = createService(new FakePlatformConfigRepository());
    const health = await service.health(admin);
    expect(health).toMatchObject({ status: "ok", database: "ok" });
    expect(typeof health.uptimeSeconds).toBe("number");
    expect(typeof health.serverTime).toBe("string");
  });

  it("reports a degraded database when the connection check fails", async () => {
    const service = createService(new FakePlatformConfigRepository(), () => {
      throw new Error("database unreachable");
    });
    await expect(service.health(admin)).resolves.toMatchObject({
      status: "ok",
      database: "degraded",
    });
  });
});

function createService(
  repository: PlatformConfigRepository,
  checkConnection: () => Promise<void> = async () => {},
): PlatformService {
  return new PlatformService({
    repository,
    transactions: immediateTransaction(repository),
    accountReader: { findAccountByUserId: findAccount },
    checkConnection,
    clock,
  });
}

async function findAccount(userId: string): Promise<IdentityAccountRecord | null> {
  if (userId === admin.userId) return account(admin.userId, "system_admin");
  if (userId === student.userId) return account(student.userId, "student");
  return null;
}

function account(userId: string, platformRole: "student" | "system_admin"): IdentityAccountRecord {
  return {
    user: { id: userId, email: `${userId}@rmit.edu.au`, createdAt: now },
    profile: {
      userId,
      displayName: "Test",
      bio: null,
      avatarMediaId: null,
      platformRole,
      status: "active",
      isPublic: true,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

class FakePlatformConfigRepository implements PlatformConfigRepository {
  private readonly records = new Map<string, PlatformConfigRecord>();

  async findConfig(key: string): Promise<PlatformConfigRecord | null> {
    return this.records.get(key) ?? null;
  }

  async listConfigs(): Promise<readonly PlatformConfigRecord[]> {
    return [...this.records.values()];
  }

  async upsertConfig(input: UpsertPlatformConfigInput): Promise<PlatformConfigRecord> {
    const record = { key: input.key, value: input.value, updatedAt: input.updatedAt };
    this.records.set(record.key, record);
    return record;
  }
}

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: (work) => work(repository) };
}
