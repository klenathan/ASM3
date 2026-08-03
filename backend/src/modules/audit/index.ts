import type { Logger } from "pino";

import type { Database } from "../../db/client";
import type { IdentityRepository } from "../identity/application/identity.repository";
import { AuditEventConsumer } from "./application/audit-events.consumer";
import type { AuditMessageSource } from "./application/audit-events.consumer";
import { AuditTrailService } from "./application/audit-trail.service";
import { DrizzleAuditEventRepository } from "./infrastructure/drizzle-audit-events.repository";
import { SqsAuditMessageSource } from "./infrastructure/sqs-audit-message.source";

export interface AuditModuleDependencies {
  readonly database: Database;
  readonly region: string | null;
  readonly threadEventsQueueUrl: string | null;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
  readonly logger: Logger;
}

export interface AuditModule {
  readonly repository: DrizzleAuditEventRepository;
  readonly source: AuditMessageSource | null;
  readonly consumer: AuditEventConsumer | null;
  readonly auditService: AuditTrailService;
  start(): void;
  stop(): Promise<void>;
}

export function createAuditModule(
  dependencies: AuditModuleDependencies,
): AuditModule {
  const repository = new DrizzleAuditEventRepository(dependencies.database);
  const source = dependencies.region !== null && dependencies.threadEventsQueueUrl !== null
    ? new SqsAuditMessageSource({
        region: dependencies.region,
        queueUrl: dependencies.threadEventsQueueUrl,
      })
    : null;
  const consumer = source === null
    ? null
    : new AuditEventConsumer({
        source,
        repository,
        logger: dependencies.logger,
      });
  const auditService = new AuditTrailService({
    repository,
    accountReader: dependencies.accountReader,
  });

  return {
    repository,
    source,
    consumer,
    auditService,
    start(): void {
      consumer?.start();
    },
    async stop(): Promise<void> {
      await consumer?.stop();
    },
  };
}

export { AuditEventConsumer } from "./application/audit-events.consumer";
export type {
  AuditMessage,
  AuditMessageSource,
} from "./application/audit-events.consumer";
export type { AuditEventRepository } from "./application/audit-events.repository";
export { AuditTrailService } from "./application/audit-trail.service";
export type { AuditTrailServiceDependencies } from "./application/audit-trail.service";
export { DrizzleAuditEventRepository } from "./infrastructure/drizzle-audit-events.repository";
export { SqsAuditMessageSource } from "./infrastructure/sqs-audit-message.source";
export type {
  AuditEventRecord,
} from "./domain/audit.event";
export {
  registerAuditRoutes,
  type AuditRouteDependencies,
} from "./presentation/audit.routes";

