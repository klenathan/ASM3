import { and, desc, eq, ilike, inArray, lt, or, type SQL } from "drizzle-orm";

import type { Database } from "../../../db/client";
import type { TransactionManager } from "../../../shared/application/transaction";
import {
  cursorFor,
  decodeCursor,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "../../../shared/application/pagination";
import { ApplicationError } from "../../../shared/domain/errors";
import type {
  AuthSessionRecord,
  AuthUserRecord,
  IdentityAccountRecord,
  PlatformRole,
  UserProfileRecord,
  UserStatus,
} from "../domain/identity.types";
import type {
  CreateAuthUserInput,
  CreateSessionInput,
  CreateUserProfileInput,
  FindUsersFilter,
  IdentityRepository,
  UpdateUserAccessInput,
  UpdateUserProfileInput,
} from "../application/identity.repository";
import { authSessions, authUsers } from "./auth.tables";
import { userProfiles } from "./user-profile.tables";

type IdentityExecutor = Pick<Database, "select" | "insert" | "update" | "delete">;

export class DrizzleIdentityRepository implements IdentityRepository {
  private readonly executor: IdentityExecutor;

  constructor(executor: IdentityExecutor) {
    this.executor = executor;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const rows = await this.executor
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toAuthUser(row);
  }

  async findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null> {
    const rows = await this.executor
      .select({ user: authUsers, profile: userProfiles })
      .from(authUsers)
      .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
      .where(eq(authUsers.id, userId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { user: toAuthUser(row.user), profile: toProfile(row.profile) };
  }

  async findAccountsByUserIds(userIds: readonly string[]): Promise<readonly IdentityAccountRecord[]> {
    if (userIds.length === 0) return [];
    const rows = await this.executor
      .select({ user: authUsers, profile: userProfiles })
      .from(authUsers)
      .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
      .where(inArray(authUsers.id, [...userIds]));
    return rows.map((row) => ({ user: toAuthUser(row.user), profile: toProfile(row.profile) }));
  }

  async findUsers(
    page: PageRequest,
    filter?: FindUsersFilter,
  ): Promise<PageResult<IdentityAccountRecord>> {
    const after = page.cursor === undefined ? undefined : userAfter(page.cursor);
    const conditions: (SQL | undefined)[] = [];
    if (filter?.status !== undefined) {
      conditions.push(eq(userProfiles.status, filter.status));
    }
    const search = filter?.search?.trim();
    if (search !== undefined && search.length > 0) {
      const pattern = `%${search.toLowerCase()}%`;
      conditions.push(or(ilike(authUsers.email, pattern), ilike(userProfiles.displayName, pattern)));
    }
    if (after !== undefined) {
      conditions.push(after);
    }

    const where = and(...conditions);
    const base = this.executor
      .select({ user: authUsers, profile: userProfiles })
      .from(authUsers)
      .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id));

    const rows = where === undefined
      ? await base
          .orderBy(desc(userProfiles.createdAt), desc(authUsers.id))
          .limit(page.limit + 1)
      : await base
          .where(where)
          .orderBy(desc(userProfiles.createdAt), desc(authUsers.id))
          .limit(page.limit + 1);

    return userPageResult(rows, page.limit);
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUserRecord> {
    const rows = await this.executor.insert(authUsers).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("IDENTITY_DATA_INVALID", "The account could not be created");
    }

    return toAuthUser(row);
  }

  async createProfile(input: CreateUserProfileInput): Promise<UserProfileRecord> {
    const rows = await this.executor.insert(userProfiles).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("IDENTITY_DATA_INVALID", "The account profile could not be created");
    }

    return toProfile(row);
  }

  async updateProfile(userId: string, input: UpdateUserProfileInput): Promise<UserProfileRecord> {
    const values: {
      readonly displayName?: string;
      readonly bio?: string | null;
      readonly avatarMediaId?: string | null;
      readonly isPublic?: boolean;
      readonly updatedAt: Date;
    } = {
      updatedAt: input.updatedAt,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.bio === undefined ? {} : { bio: input.bio }),
      ...(input.avatarMediaId === undefined ? {} : { avatarMediaId: input.avatarMediaId }),
      ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
    };
    const rows = await this.executor
      .update(userProfiles)
      .set(values)
      .where(eq(userProfiles.userId, userId))
      .returning();
    const row = rows[0];
    if (row === undefined) throw new ApplicationError("USER_NOT_FOUND", "User was not found");
    return toProfile(row);
  }

  async updateUserAccess(userId: string, input: UpdateUserAccessInput): Promise<UserProfileRecord> {
    const values: {
      readonly platformRole?: PlatformRole;
      readonly status?: UserStatus;
      readonly suspendedUntil?: Date | null;
      readonly updatedAt: Date;
    } = {
      updatedAt: input.updatedAt,
      ...(input.platformRole === undefined ? {} : { platformRole: input.platformRole }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.suspendedUntil === undefined ? {} : { suspendedUntil: input.suspendedUntil }),
    };
    const rows = await this.executor
      .update(userProfiles)
      .set(values)
      .where(eq(userProfiles.userId, userId))
      .returning();
    const row = rows[0];
    if (row === undefined) throw new ApplicationError("USER_NOT_FOUND", "User was not found");
    return toProfile(row);
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const rows = await this.executor.insert(authSessions).values(input).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("IDENTITY_DATA_INVALID", "The session could not be created");
    }

    return toSession(row);
  }

  async findSessionById(id: string): Promise<AuthSessionRecord | null> {
    const rows = await this.executor
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }

  async deleteSessionById(id: string): Promise<void> {
    await this.executor.delete(authSessions).where(eq(authSessions.id, id));
  }
}

export class DrizzleIdentityTransactionManager implements TransactionManager<IdentityRepository> {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(work: (transaction: IdentityRepository) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      return work(new DrizzleIdentityRepository(transaction));
    });
  }
}

function toAuthUser(row: typeof authUsers.$inferSelect): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
  };
}

function toProfile(row: typeof userProfiles.$inferSelect): UserProfileRecord {
  if (!isPlatformRole(row.platformRole) || !isUserStatus(row.status)) {
    throw new ApplicationError("IDENTITY_DATA_INVALID", "The account profile contains invalid state");
  }

  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    avatarMediaId: row.avatarMediaId,
    platformRole: row.platformRole,
    status: row.status,
    isPublic: row.isPublic,
    suspendedUntil: row.suspendedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSession(row: typeof authSessions.$inferSelect): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function isPlatformRole(value: string): value is PlatformRole {
  return value === "student" || value === "system_admin";
}

function isUserStatus(value: string): value is UserStatus {
  return value === "active" || value === "suspended" || value === "deactivated";
}

function toAccount(row: {
  readonly user: typeof authUsers.$inferSelect;
  readonly profile: typeof userProfiles.$inferSelect;
}): IdentityAccountRecord {
  return { user: toAuthUser(row.user), profile: toProfile(row.profile) };
}

function userPageResult(
  rows: readonly {
    readonly user: typeof authUsers.$inferSelect;
    readonly profile: typeof userProfiles.$inferSelect;
  }[],
  limit: number,
): PageResult<IdentityAccountRecord> {
  const items = rows.slice(0, limit).map(toAccount);
  const last = items.at(-1);
  const hasMore = rows.length > limit;
  return {
    items,
    hasMore,
    nextCursor: hasMore && last !== undefined
      ? encodeCursor(cursorFor(last.profile.createdAt, last.user.id))
      : null,
  };
}

function userAfter(encoded: string): SQL<unknown> | undefined {
  const cursor = decodeCursor(encoded);
  if (typeof cursor.value !== "string" || !isUuid(cursor.id)) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  const date = new Date(cursor.value);
  if (Number.isNaN(date.getTime())) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  return or(
    lt(userProfiles.createdAt, date),
    and(eq(userProfiles.createdAt, date), lt(authUsers.id, cursor.id)),
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
