import { and, asc, eq, gt, or } from "drizzle-orm";

import type { Database } from "../../../db/client.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { InvalidCursorError, ApplicationError } from "../../../shared/domain/errors.js";
import {
  cursorFor,
  decodeCursor,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "../../../shared/application/pagination.js";
import type {
  SocietyRepository,
  CreateRuleInput,
  CreateSocietyInput,
  UpdateRuleInput,
} from "../application/society.repository.js";
import {
  assertSocietyStatus,
  type SocietyRecord,
  type SocietyRuleRecord,
} from "../domain/society.js";
import { societies, societyRules } from "./society.tables.js";

type SocietyExecutor = Pick<Database, "select" | "insert" | "update" | "delete">;

export class DrizzleSocietyRepository implements SocietyRepository {
  private readonly executor: SocietyExecutor;

  constructor(executor: SocietyExecutor) {
    this.executor = executor;
  }

  async listSocieties(page: PageRequest): Promise<PageResult<SocietyRecord>> {
    const after = page.cursor === undefined ? undefined : societyAfter(page.cursor);
    const rows = await this.executor
      .select()
      .from(societies)
      .where(after === undefined ? eq(societies.status, "active") : and(
        eq(societies.status, "active"),
        after,
      ))
      .orderBy(asc(societies.name), asc(societies.id))
      .limit(page.limit + 1);
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map(toSociety);
    const last = items.at(-1);

    return {
      items,
      hasMore,
      nextCursor: hasMore && last !== undefined
        ? encodeCursor(cursorFor(last.name, last.id))
        : null,
    };
  }

  async findSocietyById(societyId: string): Promise<SocietyRecord | null> {
    const rows = await this.executor
      .select()
      .from(societies)
      .where(eq(societies.id, societyId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toSociety(row);
  }

  async findSocietyBySlug(slug: string): Promise<SocietyRecord | null> {
    const rows = await this.executor
      .select()
      .from(societies)
      .where(eq(societies.slug, slug))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toSociety(row);
  }

  async createSociety(input: CreateSocietyInput): Promise<SocietyRecord> {
    try {
      const rows = await this.executor
        .insert(societies)
        .values(input)
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new ApplicationError("SOCIETY_DATA_INVALID", "The society could not be created");
      }

      return toSociety(row);
    } catch (error) {
      throw mapUniqueViolation(error, "A society with this slug already exists");
    }
  }

  async listRules(societyId: string): Promise<readonly SocietyRuleRecord[]> {
    const rows = await this.executor
      .select()
      .from(societyRules)
      .where(eq(societyRules.societyId, societyId))
      .orderBy(asc(societyRules.position), asc(societyRules.id));
    return rows.map(toRule);
  }

  async findRuleById(societyId: string, ruleId: string): Promise<SocietyRuleRecord | null> {
    const rows = await this.executor
      .select()
      .from(societyRules)
      .where(and(eq(societyRules.societyId, societyId), eq(societyRules.id, ruleId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toRule(row);
  }

  async createRule(input: CreateRuleInput): Promise<SocietyRuleRecord> {
    try {
      const rows = await this.executor
        .insert(societyRules)
        .values(input)
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new ApplicationError("SOCIETY_DATA_INVALID", "The society rule could not be created");
      }

      return toRule(row);
    } catch (error) {
      throw mapUniqueViolation(error, "A rule already uses this position");
    }
  }

  async updateRule(
    societyId: string,
    ruleId: string,
    input: UpdateRuleInput,
  ): Promise<SocietyRuleRecord | null> {
    const values: {
      readonly position?: number;
      readonly title?: string;
      readonly description?: string;
      readonly updatedAt: Date;
    } = {
      updatedAt: input.updatedAt,
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
    };

    try {
      const rows = await this.executor
        .update(societyRules)
        .set(values)
        .where(and(eq(societyRules.societyId, societyId), eq(societyRules.id, ruleId)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : toRule(row);
    } catch (error) {
      throw mapUniqueViolation(error, "A rule already uses this position");
    }
  }

  async deleteRule(societyId: string, ruleId: string): Promise<boolean> {
    const rows = await this.executor
      .delete(societyRules)
      .where(and(eq(societyRules.societyId, societyId), eq(societyRules.id, ruleId)))
      .returning({ id: societyRules.id });
    return rows.length > 0;
  }
}

export class DrizzleSocietyTransactionManager implements TransactionManager<SocietyRepository> {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(work: (transaction: SocietyRepository) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      work(new DrizzleSocietyRepository(transaction)),
    );
  }
}

function societyAfter(encoded: string) {
  const cursor = decodeCursor(encoded);
  if (typeof cursor.value !== "string" || !isUuid(cursor.id)) {
    throw new InvalidCursorError();
  }

  return or(
    gt(societies.name, cursor.value),
    and(eq(societies.name, cursor.value), gt(societies.id, cursor.id)),
  );
}

function toSociety(row: typeof societies.$inferSelect): SocietyRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: assertSocietyStatus(row.status),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRule(row: typeof societyRules.$inferSelect): SocietyRuleRecord {
  return {
    id: row.id,
    societyId: row.societyId,
    position: row.position,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapUniqueViolation(error: unknown, message: string): unknown {
  if (isPostgresError(error, "23505")) {
    return new ApplicationError("CONFLICT", message);
  }

  return error;
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === code;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
