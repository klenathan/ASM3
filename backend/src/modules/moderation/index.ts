import type { Database } from "../../db/client";
import { systemClock, type Clock } from "../../shared/application/clock";
import type { SocietyRepository } from "../societies/application/society.repository";
import { ModerationService } from "./application/moderation.service";
import { ReportService } from "./application/report.service";
import {
  DrizzleModerationRepository,
  DrizzleModerationTransactionManager,
} from "./infrastructure/drizzle-moderation.repository";

import type { ActionEventWriter } from "../analytics/application/action-event.ports";
export interface ModerationModuleDependencies {
  readonly database: Database;
  readonly societyRepository: SocietyRepository;
  readonly clock?: Clock;
  readonly actionEventWriterFactory?: (executor: unknown) => ActionEventWriter;
}

export function createModerationModule(dependencies: ModerationModuleDependencies) {
  const repository = new DrizzleModerationRepository(dependencies.database);
  const transactions = new DrizzleModerationTransactionManager(
    dependencies.database,
    dependencies.actionEventWriterFactory,
  );
  const clock = dependencies.clock ?? systemClock;

  return {
    repository,
    transactions,
    reportService: new ReportService({
      repository,
      societyRepository: dependencies.societyRepository,
      transactions,
      clock,
    }),
    moderationService: new ModerationService({
      repository,
      societyRepository: dependencies.societyRepository,
      transactions,
      clock,
    }),
  };
}

export { ModerationService } from "./application/moderation.service";
export type { ModerationServiceDependencies } from "./application/moderation.service";
export { ReportService } from "./application/report.service";
export type { ReportServiceDependencies } from "./application/report.service";
export type {
  CreateReportCommand,
  DismissReportCommand,
  ReportDto,
  ReportPageDto,
  ResolveReportCommand,
} from "./application/moderation.dto";
export type {
  CreateModerationActionInput,
  CreateReportInput,
  ModerationRepository,
  UpdateModerationMembershipInput,
  UpdateModerationUserInput,
  UpdateReportInput,
} from "./application/moderation.repository";
export {
  DrizzleModerationRepository,
  DrizzleModerationTransactionManager,
} from "./infrastructure/drizzle-moderation.repository";
export {
  registerModerationRoutes,
  registerReportsRoutes,
} from "./presentation/moderation.routes";
export type { ModerationRouteDependencies } from "./presentation/moderation.routes";
