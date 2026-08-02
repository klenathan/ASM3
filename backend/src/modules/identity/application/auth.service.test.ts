import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { AuthService } from "./auth.service";
import type { IdentityRepository, CreateAuthUserInput, CreateSessionInput, CreateUserProfileInput, UpdateUserAccessInput, UpdateUserProfileInput } from "./identity.repository";
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
