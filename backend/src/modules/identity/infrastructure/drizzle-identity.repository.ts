import { eq } from "drizzle-orm";

import type { Database } from "../../../db/client.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type {
  AuthSessionRecord,
  AuthUserRecord,
  IdentityAccountRecord,
  PlatformRole,
  UserProfileRecord,
  UserStatus,
} from "../domain/identity.types.js";
import type {
  CreateAuthUserInput,
  CreateSessionInput,
  CreateUserProfileInput,
  IdentityRepository,
  UpdateUserAccessInput,
  UpdateUserProfileInput,
} from "../application/identity.repository.js";
import { authSessions, authUsers } from "./auth.tables.js";
import { userProfiles } from "./user-profile.tables.js";

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
      readonly updatedAt: Date;
    } = {
      updatedAt: input.updatedAt,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.bio === undefined ? {} : { bio: input.bio }),
      ...(input.avatarMediaId === undefined ? {} : { avatarMediaId: input.avatarMediaId }),
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
