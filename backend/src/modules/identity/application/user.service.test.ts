import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import { UserService } from "./user.service";
import type { AvatarMediaPort } from "./avatar-media.port";
import type {
  IdentityRepository,
  FindUsersFilter,
  UpdateUserProfileInput,
} from "./identity.repository";
import type {
  AuthUserRecord,
  AuthSessionRecord,
  IdentityAccountRecord,
  UserProfileRecord,
} from "../domain/identity.types";

const now = new Date("2026-02-01T00:00:00.000Z");
const clock: Clock = { now: () => now };
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  platformRole: "student" as const,
};

describe("UserService.updateProfile avatar validation", () => {
  it("accepts a ready avatar owned by the user", async () => {
    const avatarMedia: AvatarMediaPort = {
      assertAvatarReadyForOwner: async () => {},
    };
    const service = makeService(avatarMedia);

    await expect(
      service.updateProfile(principal, {
        avatarMediaId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toMatchObject({
      avatarMediaId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("rejects an avatar that is not ready or owned by the user", async () => {
    const avatarMedia: AvatarMediaPort = {
      assertAvatarReadyForOwner: async () => {
        throw new Error("MEDIA_NOT_READY");
      },
    };
    const service = makeService(avatarMedia);

    await expect(
      service.updateProfile(principal, {
        avatarMediaId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("MEDIA_NOT_READY");
  });

  it("detaches the avatar without calling the media port when null", async () => {
    let called = 0;
    const avatarMedia: AvatarMediaPort = {
      assertAvatarReadyForOwner: async () => {
        called += 1;
      },
    };
    const service = makeService(avatarMedia);

    await service.updateProfile(principal, { avatarMediaId: null });

    expect(called).toBe(0);
  });

  it("skips validation when only name/bio are provided", async () => {
    let called = 0;
    const avatarMedia: AvatarMediaPort = {
      assertAvatarReadyForOwner: async () => {
        called += 1;
      },
    };
    const service = makeService(avatarMedia);

    await service.updateProfile(principal, { displayName: "New Name" });

    expect(called).toBe(0);
  });

  it("does not require an avatar media port to work", async () => {
    const service = makeService(undefined);

    await expect(
      service.updateProfile(principal, {
        avatarMediaId: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toMatchObject({ avatarMediaId: "33333333-3333-4333-8333-333333333333" });
  });
});

function makeService(avatarMedia: AvatarMediaPort | undefined): UserService {
  const repository = new FakeIdentityRepository();
  return new UserService({
    repository,
    transactions: immediateTransaction(repository),
    clock,
    avatarMedia,
  });
}

class FakeIdentityRepository implements IdentityRepository {
  private user: AuthUserRecord = {
    id: principal.userId,
    email: "student@rmit.edu.au",
    createdAt: now,
  };
  private profile: UserProfileRecord = {
    userId: principal.userId,
    displayName: "Student",
    bio: null,
    avatarMediaId: "11111111-1111-4111-8111-111111111111",
    platformRole: "student",
    status: "active",
    isPublic: true,
    suspendedUntil: null,
    createdAt: now,
    updatedAt: now,
  };

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    if (userId !== principal.userId) return null;
    return { user: this.user, profile: this.profile };
  }

  async updateProfile(_userId: string, input: UpdateUserProfileInput): Promise<UserProfileRecord> {
    this.profile = {
      ...this.profile,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.bio === undefined ? {} : { bio: input.bio }),
      ...(input.avatarMediaId === undefined ? {} : { avatarMediaId: input.avatarMediaId }),
      ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
      updatedAt: input.updatedAt,
    };
    return this.profile;
  }

  async findUserByEmail(): Promise<AuthUserRecord | null> {
    return this.user;
  }

  async findAccountsByUserIds(): Promise<readonly IdentityAccountRecord[]> {
    return [{ user: this.user, profile: this.profile }];
  }

  async findUsers(_page: PageRequest, _filter?: FindUsersFilter): Promise<PageResult<IdentityAccountRecord>> {
    return { items: [], nextCursor: null, hasMore: false };
  }

  async createUser(): Promise<AuthUserRecord> {
    throw new Error("Not implemented");
  }

  async createProfile(): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async updateUserAccess(): Promise<UserProfileRecord> {
    throw new Error("Not implemented");
  }

  async createSession(): Promise<AuthSessionRecord> {
    throw new Error("Not implemented");
  }

  async findSessionById(): Promise<AuthSessionRecord | null> {
    throw new Error("Not implemented");
  }

  async deleteSessionById() {
    throw new Error("Not implemented");
  }
}

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: (work) => work(repository) };
}
