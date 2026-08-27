import type { Database } from "../../db/client";
import type { IdentityRepository } from "../identity/application/identity.repository";
import type { MembershipRepository } from "../societies/application/membership.repository";
import { AnalyticsService } from "./application/analytics.service";
import { DrizzleAnalyticsRepository } from "./infrastructure/drizzle-analytics.repository";

export interface AnalyticsModuleDependencies {
  readonly database: Database;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  readonly onRefreshRequested?: (() => Promise<void>) | undefined;
}

export function createAnalyticsModule(dependencies: AnalyticsModuleDependencies) {
  const repository = new DrizzleAnalyticsRepository(dependencies.database);

  const analyticsService = new AnalyticsService({
    repository,
    accountReader: dependencies.accountReader,
    membershipRepository: dependencies.membershipRepository,
    onRefreshRequested: dependencies.onRefreshRequested,
  });

  return {
    repository,
    analyticsService,
  };
}

export { AnalyticsService } from "./application/analytics.service";
export type { AnalyticsServiceDependencies } from "./application/analytics.service";
export { AnalyticsRefreshOrchestrator } from "./application/refresh-orchestrator";
export { InMemoryRefreshRunStore } from "./application/refresh-run.store";
export {
  PlaceholderGlueGateway,
  PlaceholderAthenaGateway,
} from "./infrastructure/placeholder-analytics-gateways";
export type {
  AthenaGateway,
  AthenaMetricRow,
  AthenaQueryInput,
  AthenaQueryStatus,
  GlueGateway,
  GlueJobRunStatus,
  MetricSqlCatalog,
  RefreshOrchestratorOptions,
  RefreshRunRecord,
  RefreshRunStatus,
  RefreshRunStore,
  RefreshRunTrigger,
} from "./application/refresh-orchestrator.ports";
export { DrizzleAnalyticsRepository } from "./infrastructure/drizzle-analytics.repository";
export type { AnalyticsRepository } from "./application/analytics.repository";
export {
  registerAnalyticsRoutes,
  SCHEDULER_SECRET_HEADER,
  type AnalyticsRouteDependencies,
} from "./presentation/analytics.routes";
