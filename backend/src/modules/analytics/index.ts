import type { Database } from "../../db/client";
import type { IdentityRepository } from "../identity/application/identity.repository";
import type { MembershipRepository } from "../societies/application/membership.repository";
import { AnalyticsService } from "./application/analytics.service";
import { DrizzleAnalyticsRepository } from "./infrastructure/drizzle-analytics.repository";
import { DrizzleRefreshRunStore } from "./infrastructure/drizzle-refresh-run.store";
import type { RequestRefreshResult } from "./application/refresh-workflow";

export interface AnalyticsModuleDependencies {
  readonly database: Database;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  readonly onRefreshRequested?: (() => Promise<RequestRefreshResult | void>) | undefined;
  readonly schedulerSecret?: string | undefined;
  readonly onScheduledRefresh?: (() => Promise<RequestRefreshResult>) | undefined;
}

export function createAnalyticsModule(dependencies: AnalyticsModuleDependencies) {
  const repository = new DrizzleAnalyticsRepository(dependencies.database);
  const refreshRunStore = new DrizzleRefreshRunStore(dependencies.database);

  const analyticsService = new AnalyticsService({
    repository,
    accountReader: dependencies.accountReader,
    membershipRepository: dependencies.membershipRepository,
    runStore: refreshRunStore,
    onRefreshRequested: dependencies.onRefreshRequested,
    schedulerSecret: dependencies.schedulerSecret,
    onScheduledRefresh: dependencies.onScheduledRefresh,
  });

  return {
    repository,
    refreshRunStore,
    analyticsService,
  };
}
export { AnalyticsService } from "./application/analytics.service";
export type { AnalyticsServiceDependencies } from "./application/analytics.service";
export {
  AnalyticsRefreshWorkflow,
  type RefreshWorkflowStarter,
  type RequestRefreshResult,
} from "./application/refresh-workflow";
export { InMemoryRefreshRunStore } from "./application/refresh-run.store";
export { DrizzleRefreshRunStore } from "./infrastructure/drizzle-refresh-run.store";
export { StepFunctionsWorkflowStarter } from "./infrastructure/step-functions-workflow-starter";
export type { StepFunctionsWorkflowStarterConfig } from "./infrastructure/step-functions-workflow-starter";
export {
  createAthenaMetricSqlCatalog,
  METRIC_SQL_TYPES,
} from "./infrastructure/athena-sql-catalog";
export type {
  AthenaMetricRow,
  MetricSqlCatalog,
  MetricSqlCatalogFactory,
  RefreshRunRecord,
  RefreshRunStatus,
  RefreshRunStore,
  RefreshRunTrigger,
} from "./application/refresh-run.ports";
export { DrizzleAnalyticsRepository } from "./infrastructure/drizzle-analytics.repository";
export type { AnalyticsRepository } from "./application/analytics.repository";
export {
  registerAnalyticsRoutes,
  SCHEDULER_SECRET_HEADER,
  type AnalyticsRouteDependencies,
} from "./presentation/analytics.routes";
