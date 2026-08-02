import { and, eq } from "drizzle-orm";

import type { Database } from "../../../db/client.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type {
  CreateMembershipInput,
  MembershipRepository,
  UpdateMembershipInput,
} from "../application/membership.repository.js";
import {
  assertMembershipRole,
  assertMembershipState,
  type MembershipRecord,
} from "../domain/membership.js";
import { societyMemberships } from "./society.tables.js";

type MembershipExecutor = Pick<Database, "select" | "insert" | "update">;

export class DrizzleMembershipRepository implements MembershipRepository {
  private readonly executor: MembershipExecutor;

  constructor(executor: MembershipExecutor) {
    this.executor = executor;
  }

  async findMembership(societyId: string, userId: string): Promise<MembershipRecord | null> {
    const rows = await this.executor
      .select()
      .from(societyMemberships)
      .where(and(eq(societyMemberships.societyId, societyId), eq(societyMemberships.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  async countActiveModerators(societyId: string): Promise<number> {
    const rows = await this.executor
      .select({ userId: societyMemberships.userId })
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.societyId, societyId),
          eq(societyMemberships.role, "moderator"),
          eq(societyMemberships.status, "active"),
        ),
      )
      .for("update");
    return rows.length;
  }

  async createMembership(input: CreateMembershipInput): Promise<MembershipRecord> {
    const rows = await this.executor
      .insert(societyMemberships)
      .values(input)
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("SOCIETY_DATA_INVALID", "The society membership could not be created");
    }

    return toMembership(row);
  }

  async updateMembership(
    societyId: string,
    userId: string,
    input: UpdateMembershipInput,
  ): Promise<MembershipRecord | null> {
    const values: {
      readonly role?: "member" | "moderator";
      readonly status?: "active" | "left" | "banned";
      readonly joinedAt?: Date;
      readonly updatedAt: Date;
      readonly bannedBy?: string | null;
      readonly bannedAt?: Date | null;
    } = {
      updatedAt: input.updatedAt,
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.joinedAt === undefined ? {} : { joinedAt: input.joinedAt }),
      ...(input.bannedBy === undefined ? {} : { bannedBy: input.bannedBy }),
      ...(input.bannedAt === undefined ? {} : { bannedAt: input.bannedAt }),
    };
    const rows = await this.executor
      .update(societyMemberships)
      .set(values)
      .where(and(eq(societyMemberships.societyId, societyId), eq(societyMemberships.userId, userId)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }
}

export class DrizzleMembershipTransactionManager implements TransactionManager<MembershipRepository> {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(work: (transaction: MembershipRepository) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      work(new DrizzleMembershipRepository(transaction)),
    );
  }
}

function toMembership(row: typeof societyMemberships.$inferSelect): MembershipRecord {
  return {
    societyId: row.societyId,
    userId: row.userId,
    role: assertMembershipRole(row.role),
    status: assertMembershipState(row.status),
    joinedAt: row.joinedAt,
    updatedAt: row.updatedAt,
    bannedBy: row.bannedBy,
    bannedAt: row.bannedAt,
  };
}
