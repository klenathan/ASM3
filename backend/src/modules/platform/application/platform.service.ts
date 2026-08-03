import type { Clock } from "../../../shared/application/clock";
import { systemClock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  assertSystemAdmin,
  assertTargetExists,
} from "../../identity/domain/access.policy";
import type { IdentityRepository } from "../../identity/application/identity.repository";
import {
  defaultForConfigKey,
  DEFAULT_PLATFORM_CONFIG_KEYS,
  type PlatformConfigKey,
} from "../domain/platform";
import type { PlatformConfigDto, PlatformHealthDto } from "./platform.dto";
import type { PlatformConfigRepository } from "./platform.repository";

export interface PlatformServiceDependencies {
  readonly repository: PlatformConfigRepository;
  readonly transactions: TransactionManager<PlatformConfigRepository>;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly checkConnection: () => Promise<void>;
  readonly clock?: Clock;
}

export class PlatformService {
  private readonly repository: PlatformConfigRepository;
  private readonly transactions: TransactionManager<PlatformConfigRepository>;
  private readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  private readonly checkConnection: () => Promise<void>;
  private readonly clock: Clock;

  constructor(dependencies: PlatformServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.accountReader = dependencies.accountReader;
    this.checkConnection = dependencies.checkConnection;
    this.clock = dependencies.clock ?? systemClock;
  }

  async listConfig(principal: RequestPrincipal): Promise<PlatformConfigDto[]> {
    await this.authorize(principal);
    const stored = await this.repository.listConfigs();
    const storedByKey = new Map(stored.map((record) => [record.key, record]));

    return DEFAULT_PLATFORM_CONFIG_KEYS.map((key) => {
      const record = storedByKey.get(key);
      return {
        key,
        value: record?.value ?? defaultForConfigKey(key) ?? "",
        updatedAt: record?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async upsertConfig(
    principal: RequestPrincipal,
    key: PlatformConfigKey,
    value: string,
  ): Promise<PlatformConfigDto> {
    await this.authorize(principal);
    const saved = await this.transactions.withTransaction((repository) =>
      repository.upsertConfig({ key, value, updatedAt: this.clock.now() }),
    );
    return {
      key: saved.key,
      value: saved.value,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async health(principal: RequestPrincipal): Promise<PlatformHealthDto> {
    await this.authorize(principal);
    let database: PlatformHealthDto["database"] = "ok";
    try {
      await this.checkConnection();
    } catch (error) {
      database = "degraded";
    }
    return {
      status: "ok",
      database,
      uptimeSeconds: Math.floor(process.uptime()),
      serverTime: new Date().toISOString(),
    };
  }

  private async authorize(principal: RequestPrincipal): Promise<void> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);
  }
}
