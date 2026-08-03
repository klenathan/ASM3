import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type {
  AuthSessionRecord,
  AuthUserRecord,
  IdentityAccountRecord,
  UserProfileRecord,
} from "../domain/identity.types";
import type {
  CreateAuthUserInput,
  CreateSessionInput,
  CreateUserProfileInput,
  FindUsersFilter,
  IdentityRepository,
  UpdateUserAccessInput,
  UpdateUserProfileInput,
} from "./identity.repository";
import { AdminUserService } from "./admin-user.service";

const now = new Date("2026-03-01T00:00:00.000Z");
const clock: Clock = { now: () => now };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
const student: RequestPrincipal = { userId: "student-id", platformRole: "student" };

describe("AdminUserService.listUsers", () => {
  it("rejects a non-system-admin actor with ADMIN_REQUIRED", async () => {
    const repository = new FakeIdentityRepository();
    repository.add(account(student.userId, "student"));
    const service = new AdminUserService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
    });

    await expect(service.listUsers(student, { limit: 20 })).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });

  it("lists the user directory for a system admin", async () => {
    const repository = new FakeIdentityRepository();
    repository.add(account("u1", "student"));
    repository.add(account(admin.userId, "system_admin"));
    const service = new AdminUserService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
    });

    const result = await service.listUsers(admin, { limit: 20 }, { status: "active" });
    expect(result.items.length).toBe(2);
    expect(result.items[0]).toMatchObject({ userId: "u1", email: "u1@rmit.edu.au" });
  });
});

describe("AdminUserService.activateUser", () => {
  it("re-activates a deactivated user as a system admin", async () => {
    const repository = new FakeIdentityRepository();
    repository.add(account("u1", "student", "deactivated"));
    repository.add(account(admin.userId, "system_admin"));
    const service = new AdminUserService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
    });

    const result = await service.activateUser(admin, "u1");

    expect(result).toMatchObject({ userId: "u1", status: "active", suspendedUntil: null });
  });

  it("rejects a non-system-admin actor with ADMIN_REQUIRED", async () => {
    const repository = new FakeIdentityRepository();
    repository.add(account("u1", "student", "deactivated"));
    repository.add(account(student.userId, "student"));
    const service = new AdminUserService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
    });

    await expect(service.activateUser(student, "u1")).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });

  it("rejects activating your own account with SELF_ADMIN_ACTION_FORBIDDEN", async () => {
    const repository = new FakeIdentityRepository();
    repository.add(account(admin.userId, "system_admin"));
    const service = new AdminUserService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
    });

    await expect(service.activateUser(admin, admin.userId)).rejects.toMatchObject({
      code: "SELF_ADMIN_ACTION_FORBIDDEN",
    });
  });
});

function account(
  userId: string,
  platformRole: "student" | "system_admin",
  status: "active" | "suspended" | "deactivated" = "active",
): IdentityAccountRecord {
  return {
    user: { id: userId, email: `${userId}@rmit.edu.au`, createdAt: now },
    profile: {
      userId,
      displayName: "User",
      bio: null,
      avatarMediaId: null,
      platformRole,
      status,
      isPublic: true,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

class FakeIdentityRepository implements IdentityRepository {
  private accounts = new Map<string, IdentityAccountRecord>();

  add(account: IdentityAccountRecord): void {
    this.accounts.set(account.user.id, account);
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    for (const account of this.accounts.values()) {
      if (account.user.email === email) return account.user;
    }
    return null;
  }

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    return this.accounts.get(userId) ?? null;
  }

  async findAccountsByUserIds(userIds: readonly string[]): Promise<readonly IdentityAccountRecord[]> {
    return userIds
      .map((id) => this.accounts.get(id))
      .filter((account): account is IdentityAccountRecord => account !== undefined);
  }

  async findUsers(
    page: PageRequest,
    filter?: FindUsersFilter,
  ): Promise<PageResult<IdentityAccountRecord>> {
    let items = [...this.accounts.values()];
    if (filter?.status !== undefined) {
      items = items.filter((account) => account.profile.status === filter.status);
    }
    const result = items.slice(0, page.limit);
    return {
      items: result,
      nextCursor: null,
      hasMore: items.length > page.limit,
    };
  }

  async createUser(_input: CreateAuthUserInput): Promise<AuthUserRecord> {
    throw new Error("Not implemented");
  }

  async createProfile(_input: CreateUserProfileInput): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async updateProfile(_userId: string, _input: UpdateUserProfileInput): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async updateUserAccess(userId: string, input: UpdateUserAccessInput): Promise<UserProfileRecord> {
    const account = this.accounts.get(userId);
    if (account === undefined) throw new Error("Not found");
    const profile: UserProfileRecord = {
      ...account.profile,
      updatedAt: input.updatedAt,
      ...(input.platformRole === undefined ? {} : { platformRole: input.platformRole }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.suspendedUntil === undefined ? {} : { suspendedUntil: input.suspendedUntil }),
    };
    this.accounts.set(userId, { ...account, profile });
    return profile;
  }

  async createSession(_input: CreateSessionInput): Promise<AuthSessionRecord> {
    throw new Error("Not implemented");
  }

  async findSessionById(_id: string): Promise<AuthSessionRecord | null> {
    throw new Error("Not implemented");
  }

  async deleteSessionById(): Promise<void> {
    throw new Error("Not implemented");
  }
}

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: (work) => work(repository) };
}
