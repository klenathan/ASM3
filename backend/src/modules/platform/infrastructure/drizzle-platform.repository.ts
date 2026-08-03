import { eq } from "drizzle-orm";

import type { Database } from "../../../db/client";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { PlatformConfigRecord } from "../domain/platform";
import type {
  PlatformConfigRepository,
  UpsertPlatformConfigInput,
} from "../application/platform.repository";
import { platformConfig } from "./platform.tables";

type PlatformExecutor = Pick<Database, "select" | "insert">;

export class DrizzlePlatformConfigRepository implements PlatformConfigRepository {
  private readonly executor: PlatformExecutor;

  constructor(executor: PlatformExecutor) {
    this.executor = executor;
  }

  async findConfig(key: string): Promise<PlatformConfigRecord | null> {
    const rows = await this.executor
      .select()
      .from(platformConfig)
      .where(eq(platformConfig.key, key))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toPlatformConfig(row);
  }

  async listConfigs(): Promise<readonly PlatformConfigRecord[]> {
    const rows = await this.executor.select().from(platformConfig);
    return rows.map(toPlatformConfig);
  }

  async upsertConfig(input: UpsertPlatformConfigInput): Promise<PlatformConfigRecord> {
    const rows = await this.executor
      .insert(platformConfig)
      .values(input)
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: { value: input.value, updatedAt: input.updatedAt },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("PLATFORM_CONFIG_INVALID", "The platform config could not be saved");
    }
    return toPlatformConfig(row);
  }
}

export class DrizzlePlatformConfigTransactionManager
  implements TransactionManager<PlatformConfigRepository>
{
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  withTransaction<TResult>(
    work: (transaction: PlatformConfigRepository) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      work(new DrizzlePlatformConfigRepository(transaction)),
    );
  }
}

export function createPlatformConfigReader(database: Database) {
  const repository = new DrizzlePlatformConfigRepository(database);
  return async (key: string): Promise<string | null> => {
    const record = await repository.findConfig(key);
    return record === null ? null : record.value;
  };
}

function toPlatformConfig(row: typeof platformConfig.$inferSelect): PlatformConfigRecord {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt,
  };
}
