import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import pino from "pino";

loadDotenv({ quiet: true });

import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { SERVICE_NAME } from "./constants";
import { createDatabase } from "./db/client";
import { createLogger } from "./lib/logger";
import { createIdentityModule } from "./modules/identity/index";
import { createSocietyModule } from "./modules/societies/index";
import { createDiscussionsModule } from "./modules/discussions/index";
import { createModerationModule } from "./modules/moderation/index";
import { createAuditModule } from "./modules/audit/index";
import { createPlatformModule, createPlatformConfigReader } from "./modules/platform/index";
import { createMediaModule, RemoteMediaStorage, S3MediaStorage } from "./modules/media/index";
import { DrizzleThreadAttachmentAdapter } from "./modules/discussions/infrastructure/drizzle-thread-attachment.adapter";
import { NoopThreadEventPublisher } from "./modules/discussions/application/thread-events.port";
import { SqsThreadEventPublisher } from "./modules/discussions/infrastructure/thread-events.sqs.publisher";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config, logger);
  const societies = createSocietyModule({ database: database.db });
  const s3Storage = config.awsRegion === null || config.mediaBucket === null
    ? undefined
    : new S3MediaStorage({
        region: config.awsRegion,
        bucket: config.mediaBucket,
      });
  const media = createMediaModule({
    database: database.db,
    storage: new RemoteMediaStorage(s3Storage),
    attachmentPort: new DrizzleThreadAttachmentAdapter(database.db),
  });
  const threadEventPublisher = config.awsRegion !== null && config.threadEventsQueueUrl !== null
    ? new SqsThreadEventPublisher({
        region: config.awsRegion,
        queueUrl: config.threadEventsQueueUrl,
        logger,
      })
    : new NoopThreadEventPublisher();
  const identity = createIdentityModule({
    database: database.db,
    allowedEmailDomains: config.allowedEmailDomains,
    configReader: createPlatformConfigReader(database.db),
    avatarMedia: media.mediaService,
  });
  const discussions = createDiscussionsModule({
    database: database.db,
    membershipRepository: societies.membershipRepository,
    societyRepository: societies.societyRepository,
    media: media.mediaService,
    events: threadEventPublisher,
    profile: {
      findPublicIdentity: async (userId) => {
        const account = await identity.repository.findAccountByUserId(userId);
        return account === null
          ? null
          : {
              displayName: account.profile.displayName,
              avatarMediaId: account.profile.avatarMediaId,
            };
      },
      findPublicIdentities: async (userIds) => {
        const accounts = await identity.repository.findAccountsByUserIds(userIds);
        return new Map(
          accounts.map((account) => [
            account.user.id,
            {
              displayName: account.profile.displayName,
              avatarMediaId: account.profile.avatarMediaId,
            },
          ]),
        );
      },
      canReadActivityBy: async (viewer, authorId) => {
        const target = await identity.repository.findAccountByUserId(authorId);
        if (target === null) return false;
        if (target.profile.isPublic) return true;
        if (viewer === undefined) return false;
        if (viewer.userId === authorId) return true;
        if (viewer.platformRole === "system_admin") return true;
        return false;
      },
    },
  });
  const moderation = createModerationModule({
    database: database.db,
    societyRepository: societies.societyRepository,
  });
  const platform = createPlatformModule({
    database: database.db,
    accountReader: identity.repository,
    checkConnection: database.checkConnection,
  });
  const audit = createAuditModule({
    database: database.db,
    region: config.awsRegion,
    threadEventsQueueUrl: config.threadEventsQueueUrl,
    accountReader: identity.repository,
    logger,
  });
  audit.start();
  const app = createApp({
    config,
    logger,
    checkReadiness: database.checkConnection,
    identity,
    societies,
    discussions,
    moderation,
    platform,
    media,
    audit,
  });

  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    },
    (info) => {
      logger.info(
        {
          host: info.address,
          port: info.port,
        },
        "API listening",
      );
    },
  );

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "shutdown requested");

    const forceShutdown = setTimeout(() => {
      logger.fatal("graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceShutdown.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await audit.stop();
      await database.close();
      clearTimeout(forceShutdown);
      logger.info("shutdown complete");
    } catch (error) {
      logger.fatal({ err: error }, "graceful shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  pino({ base: { service: SERVICE_NAME } }).fatal(
    { err: error },
    "API failed to start",
  );
  process.exitCode = 1;
});
