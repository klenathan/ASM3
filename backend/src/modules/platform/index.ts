import type { Database } from "../../db/client";
import type { IdentityRepository } from "../identity/application/identity.repository";
import { PlatformService } from "./application/platform.service";
import {
  createPlatformConfigReader,
  DrizzlePlatformConfigRepository,
  DrizzlePlatformConfigTransactionManager,
} from "./infrastructure/drizzle-platform.repository";

export interface PlatformModuleDependencies {
  readonly database: Database;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly checkConnection: () => Promise<void>;
}

export function createPlatformModule(dependencies: PlatformModuleDependencies) {
  const repository = new DrizzlePlatformConfigRepository(dependencies.database);
  const transactions = new DrizzlePlatformConfigTransactionManager(dependencies.database);

  return {
    repository,
    transactions,
    platformService: new PlatformService({
      repository,
      transactions,
      accountReader: dependencies.accountReader,
      checkConnection: dependencies.checkConnection,
    }),
  };
}

export { PlatformService } from "./application/platform.service";
export type { PlatformServiceDependencies } from "./application/platform.service";
export type { ConfigReader } from "./application/config-reader";
export {
  DrizzlePlatformConfigRepository,
  DrizzlePlatformConfigTransactionManager,
  createPlatformConfigReader,
} from "./infrastructure/drizzle-platform.repository";
export type { PlatformConfigRepository } from "./application/platform.repository";
export {
  registerPlatformRoutes,
  type PlatformRouteDependencies,
} from "./presentation/platform.routes";
