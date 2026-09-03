import type { Database } from "../../db/client";
import type { IdentityRepository } from "../identity/application/identity.repository";
import type { MembershipRepository } from "../societies/application/membership.repository";
import { AnalyticsService } from "./application/analytics.service";
import { DrizzleAnalyticsRepository } from "./infrastructure/drizzle-analytics.repository";
import { DrizzleRefreshRunStore } from "./infrastructure/drizzle-refresh-run.store";
import type { RefreshRange } from "./application/refresh-range";
import type { RequestRefreshResult } from "./application/refresh-workflow";

export interface AnalyticsModuleDependencies {
  readonly database: Database;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly membershipRepository: Pick<MembershipRepository, "findMembership">;
  readonly onRefreshRequested?: ((range?: RefreshRange) => Promise<RequestRefreshResult | void>) | undefined;
  readonly schedulerSecret?: string | undefined;
  readonly onScheduledRefresh?: (() => Promise<RequestRefreshResult>) | undefined;
}

export function createAnalyticsModule(dependencies: AnalyticsModuleDependencies) {
  const repository = new DrizzleAnalyticsRepository(dependencies.database);
  const refreshRunStore = new DrizzleRefreshRunStore(dependencies.database);

  const analyticsService = new AnalyticsService({
    repository,
    actionMetricsRepository: repository,
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
export type {
  ActionEventWriter,
  ActionEventRetention,
} from "./application/action-event.ports";
export {
  ACTION_EVENT_SCHEMA_VERSION,
  ACTION_EVENT_TYPES,
  validateActionEvent,
  type ActionEventInput,
  type PersistedActionEvent,
} from "./domain/action-event";
export {
  createHmacPseudonymizer,
  decodePseudonymKey,
  type ActionEventPseudonymizer,
} from "./domain/pseudonymizer";
export { DrizzleActionEventWriter } from "./infrastructure/drizzle-action-event.writer";
export {
  actionMetricDataSchema,
  activityMetricDataSchema,
  currentStateMetricDataSchema,
  reconciliationMetricDataSchema,
} from "./domain/action-metrics";
export type {
  ActionMetricRecord,
  ActionMetricData,
} from "./domain/action-metrics";
export type { ActionMetricsRepository, ActionMetricsQuery, ActionMetricsPage } from "./application/action-metrics.repository";
