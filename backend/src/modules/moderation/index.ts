import type { Database } from "../../db/client.js";
import { systemClock, type Clock } from "../../shared/application/clock.js";
import type { SocietyRepository } from "../societies/application/society.repository.js";
import { ModerationService } from "./application/moderation.service.js";
import { ReportService } from "./application/report.service.js";
import {
  DrizzleModerationRepository,
  DrizzleModerationTransactionManager,
} from "./infrastructure/drizzle-moderation.repository.js";

export interface ModerationModuleDependencies {
  readonly database: Database;
  readonly societyRepository: SocietyRepository;
  readonly clock?: Clock;
}

export function createModerationModule(dependencies: ModerationModuleDependencies) {
  const repository = new DrizzleModerationRepository(dependencies.database);
  const transactions = new DrizzleModerationTransactionManager(dependencies.database);
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

export { ModerationService } from "./application/moderation.service.js";
export type { ModerationServiceDependencies } from "./application/moderation.service.js";
export { ReportService } from "./application/report.service.js";
export type { ReportServiceDependencies } from "./application/report.service.js";
export type {
  CreateReportCommand,
  DismissReportCommand,
  ReportDto,
  ReportPageDto,
  ResolveReportCommand,
} from "./application/moderation.dto.js";
export type {
  CreateModerationActionInput,
  CreateReportInput,
  ModerationRepository,
  UpdateModerationMembershipInput,
  UpdateModerationUserInput,
  UpdateReportInput,
} from "./application/moderation.repository.js";
export {
  DrizzleModerationRepository,
  DrizzleModerationTransactionManager,
} from "./infrastructure/drizzle-moderation.repository.js";
export {
  registerModerationRoutes,
  registerReportsRoutes,
} from "./presentation/moderation.routes.js";
export type { ModerationRouteDependencies } from "./presentation/moderation.routes.js";
