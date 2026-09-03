import type { Database } from "../../db/client";
import { systemClock, type Clock } from "../../shared/application/clock";
import { MembershipService } from "./application/membership.service";
import { SocietyService } from "./application/society.service";
import {
  DrizzleMembershipRepository,
  DrizzleMembershipTransactionManager,
} from "./infrastructure/drizzle-membership.repository";
import {
  DrizzleSocietyRepository,
  DrizzleSocietyTransactionManager,
} from "./infrastructure/drizzle-society.repository";
import type { ActionEventWriter } from "../analytics/application/action-event.ports";

export interface SocietyModuleDependencies {
  readonly database: Database;
  readonly clock?: Clock;
  readonly actionEventWriterFactory?: (executor: unknown) => ActionEventWriter;
}

export function createSocietyModule(dependencies: SocietyModuleDependencies) {
  const societyRepository = new DrizzleSocietyRepository(dependencies.database);
  const membershipRepository = new DrizzleMembershipRepository(dependencies.database);
  const societyTransactions = new DrizzleSocietyTransactionManager(dependencies.database);
  const membershipTransactions = new DrizzleMembershipTransactionManager(
    dependencies.database,
    dependencies.actionEventWriterFactory,
  );
  const clock = dependencies.clock ?? systemClock;

  return {
    societyRepository,
    membershipRepository,
    societyTransactions,
    membershipTransactions,
    societyService: new SocietyService({
      repository: societyRepository,
      membershipRepository,
      transactions: societyTransactions,
      clock,
    }),
    membershipService: new MembershipService({
      repository: membershipRepository,
      societyRepository,
      transactions: membershipTransactions,
      clock,
    }),
  };
}

export { MembershipService } from "./application/membership.service";
export type {
  MembershipServiceDependencies,
} from "./application/membership.service";
export { SocietyService } from "./application/society.service";
export type { SocietyServiceDependencies } from "./application/society.service";
export type {
  AddModeratorCommand,
  CreateRuleCommand,
  CreateSocietyCommand,
  MembershipDto,
  RuleDto,
  SocietyDto,
  SocietyPageDto,
  UpdateRuleCommand,
} from "./application/society.dto";
export type {
  MembershipRepository,
  CreateMembershipInput,
  UpdateMembershipInput,
} from "./application/membership.repository";
export type {
  SocietyRepository,
  CreateRuleInput,
  CreateSocietyInput,
  UpdateRuleInput,
} from "./application/society.repository";
export {
  DrizzleMembershipRepository,
  DrizzleMembershipTransactionManager,
} from "./infrastructure/drizzle-membership.repository";
export {
  DrizzleSocietyRepository,
  DrizzleSocietyTransactionManager,
} from "./infrastructure/drizzle-society.repository";
export { registerSocietyRoutes } from "./presentation/society.routes";
export type { SocietyRouteDependencies } from "./presentation/society.routes";
