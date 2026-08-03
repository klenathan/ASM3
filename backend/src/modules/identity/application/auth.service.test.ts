import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { ConfigReader } from "../../platform/application/config-reader";
import { AuthService } from "./auth.service";
import type { IdentityRepository, CreateAuthUserInput, CreateSessionInput, CreateUserProfileInput, FindUsersFilter, UpdateUserAccessInput, UpdateUserProfileInput } from "./identity.repository";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { PasswordAdapter } from "./password.adapter";
import type { SessionTokenAdapter } from "./session.adapter";
import type { AuthSessionRecord, AuthUserRecord, IdentityAccountRecord, UserProfileRecord } from "../domain/identity.types";

const now = new Date("2026-02-01T00:00:00.000Z");
const clock: Clock = { now: () => now };

describe("AuthService", () => {
  it("persists the password hash with registration so the new account can sign in", async () => {
    const repository = new FakeIdentityRepository();
    const passwords = new FakePasswordAdapter();
    const service = new AuthService({
      repository,
      transactions: immediateTransaction(repository),
      passwordAdapter: passwords,
      sessionAdapter: new FakeSessionAdapter(),
      clock,
      allowedEmailDomains: ["rmit.edu.au"],
    });

    await service.register({
      email: "student@rmit.edu.au",
      password: "password123",
      displayName: "Student",
    });

    expect(repository.createdPasswordHash).toBe("hashed:password123");
    await expect(
      service.signIn({ email: "student@rmit.edu.au", password: "password123" }),
    ).resolves.toMatchObject({ user: { email: "student@rmit.edu.au" } });
  });
});

describe("AuthService registration domain resolution", () => {
  it("uses the platform config value when present", async () => {
    const repository = new FakeIdentityRepository();
    const configReader: ConfigReader = async (key) =>
      key === "allowed_email_domains" ? "rmit.edu.au,student.example.com" : null;
    const service = buildService(repository, configReader, ["rmit.edu.au"]);

    await expect(
      service.register({ email: "x@student.example.com", password: "password123", displayName: "X" }),
    ).resolves.toMatchObject({ user: { email: "x@student.example.com" } });

    await expect(
      service.register({ email: "x@notallowed.edu", password: "password123", displayName: "X" }),
    ).rejects.toMatchObject({ code: "EMAIL_DOMAIN_NOT_ALLOWED" });
  });

  it("falls back to the static allow-list when no config row exists", async () => {
    const repository = new FakeIdentityRepository();
    const configReader: ConfigReader = async () => null;
    const service = buildService(repository, configReader, ["rmit.edu.au", "rmit.edu.vn"]);

    await expect(
      service.register({ email: "s@rmit.edu.au", password: "password123", displayName: "S" }),
    ).resolves.toMatchObject({ user: { email: "s@rmit.edu.au" } });

    await expect(
      service.register({ email: "s@other.com", password: "password123", displayName: "S" }),
    ).rejects.toMatchObject({ code: "EMAIL_DOMAIN_NOT_ALLOWED" });
  });

  it("fails closed when the configured allow-list is empty", async () => {
    const repository = new FakeIdentityRepository();
    const configReader: ConfigReader = async () => " ";
    const service = buildService(repository, configReader, ["rmit.edu.au"]);

    await expect(
      service.register({ email: "s@rmit.edu.au", password: "password123", displayName: "S" }),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });
});

function buildService(
  repository: FakeIdentityRepository,
  configReader: ConfigReader,
  allowedEmailDomains: readonly string[],
): AuthService {
  return new AuthService({
    repository,
    transactions: immediateTransaction(repository),
    passwordAdapter: new FakePasswordAdapter(),
    sessionAdapter: new FakeSessionAdapter(),
    clock,
    allowedEmailDomains,
    configReader,
  });
}

class FakeIdentityRepository implements IdentityRepository {
  private user: AuthUserRecord | null = null;
  private profile: UserProfileRecord | null = null;
  private readonly sessions = new Map<string, AuthSessionRecord>();
  createdPasswordHash: string | null = null;

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.user?.email === email ? this.user : null;
  }

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    if (this.user?.id !== userId || this.profile === null) return null;
    return { user: this.user, profile: this.profile };
  }

  async findAccountsByUserIds(userIds: readonly string[]): Promise<readonly IdentityAccountRecord[]> {
    const account = this.user === null ? null : await this.findAccountByUserId(this.user.id);
    return account !== null && userIds.includes(account.user.id) ? [account] : [];
  }

  async findUsers(_page: PageRequest, _filter?: FindUsersFilter): Promise<PageResult<IdentityAccountRecord>> {
    return { items: [], nextCursor: null, hasMore: false };
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUserRecord> {
    this.createdPasswordHash = input.passwordHash;
    this.user = { id: input.id, email: input.email, createdAt: now };
    return this.user;
  }

  async createProfile(input: CreateUserProfileInput): Promise<UserProfileRecord> {
    this.profile = {
      userId: input.userId,
      displayName: input.displayName,
      bio: input.bio,
      avatarMediaId: null,
      platformRole: "student",
      status: "active",
      isPublic: true,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.profile;
  }

  async updateProfile(_userId: string, _input: UpdateUserProfileInput): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async updateUserAccess(_userId: string, _input: UpdateUserAccessInput): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const session = { ...input, createdAt: now };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionById(id: string): Promise<AuthSessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteSessionById(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

class FakePasswordAdapter implements PasswordAdapter {
  async hashPassword(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async setPassword(): Promise<void> {}

  async verifyPassword(_userId: string, password: string): Promise<boolean> {
    return password === "password123";
  }

  async removePassword(): Promise<void> {}
}

class FakeSessionAdapter implements SessionTokenAdapter {
  issue() {
    return { token: "session-token", hash: "00000000-0000-4000-8000-000000000001" };
  }

  hash(token: string): string {
    return token;
  }
}

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: (work) => work(repository) };
}
