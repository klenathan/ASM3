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
import {
  ContentAnalysisService,
  DrizzleContentAnalysisRepository,
  LambdaContentAnalyzer,
  ReanalysisWorker,
  SqsReanalysisJobPublisher,
  SqsReanalysisMessageSource,
  ThreadAnalysisContextAdapter,
} from "./modules/content-analysis/index";
import { systemClock } from "./shared/application/clock";

/** Global community policy used when no `community_policy` config row is set. */
const DEFAULT_GLOBAL_POLICY =
  "RMIT Society is an RMIT-only community forum. Posts must be respectful and constructive. " +
  "No harassment, hate speech, threats, doxxing, spam, or illegal content. " +
  "No recruiting or referral farming where the poster offers no value first. " +
  "Keep content on-topic and truthful.";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config, logger);
  const societies = createSocietyModule({ database: database.db });
  // ECS resolves its LabRole through the AWS SDK credential provider chain.
  // Never inject temporary Learner Lab user credentials into the task.
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
  const reanalysisQueueOptions =
    config.contentAnalysisMode !== "off" &&
    config.awsRegion !== null &&
    config.contentAnalysisQueueUrl !== null
      ? {
          region: config.awsRegion,
          queueUrl: config.contentAnalysisQueueUrl,
        }
      : undefined;
  const reanalysisJobPublisher = reanalysisQueueOptions === undefined
    ? undefined
    : new SqsReanalysisJobPublisher(reanalysisQueueOptions);
  const identity = createIdentityModule({
    database: database.db,
    allowedEmailDomains: config.allowedEmailDomains,
    configReader: createPlatformConfigReader(database.db),
    avatarMedia: media.mediaService,
  });
  let contentAnalysisService: ContentAnalysisService | undefined;
  const contentAnalysisRepository = new DrizzleContentAnalysisRepository(database.db);
  const discussions = createDiscussionsModule({
    database: database.db,
    membershipRepository: societies.membershipRepository,
    societyRepository: societies.societyRepository,
    media: media.mediaService,
    events: threadEventPublisher,
    analysisDecisionReader: contentAnalysisRepository,
    threadAnalysisReader: contentAnalysisRepository,
    onThreadCreated: (threadId) => {
      void contentAnalysisService?.analyzeNewThread(threadId);
    },
    analysisModeration: {
      override: (threadId, decision, actorId, reason) =>
        contentAnalysisService === undefined
          ? Promise.reject(
              new Error("Automated content analysis is not configured"),
            )
          : contentAnalysisService.overrideThread(threadId, decision, actorId, reason),
      ...(reanalysisJobPublisher === undefined
        ? {}
        : {
            reanalyze: (threadId: string) =>
              reanalysisJobPublisher.enqueueReanalysis(threadId),
          }),
    },
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
  const configReader = createPlatformConfigReader(database.db);
  const contentAnalyzer =
    config.contentAnalysisMode !== "off"
      ? new LambdaContentAnalyzer({
          functionName: config.contentAnalysisLambdaFunction!,
          qualifier: config.contentAnalysisLambdaQualifier,
          timeoutMs: config.contentAnalysisTimeoutMs,
          region: config.awsRegion!,
          logger,
        })
      : undefined;
  contentAnalysisService = new ContentAnalysisService({
    repository: contentAnalysisRepository,
    ...(contentAnalyzer !== undefined ? { analyzer: contentAnalyzer } : {}),
    threadContext: new ThreadAnalysisContextAdapter({
      findThread: (threadId) => discussions.repository.findThread(threadId),
      listThreadMedia: (threadId) => discussions.repository.listThreadMedia(threadId),
      findMediaAssets: async (mediaIds) => {
        const assets = await media.repository.findAssets(mediaIds);
        return assets
          .filter(
            (asset) => asset.status === "ready" && asset.purpose === "thread_attachment",
          )
          .map((asset) => ({
            id: asset.id,
            objectKey: asset.objectKey,
            contentType: asset.contentType,
            byteSize: asset.byteSize,
          }));
      },
      listSocietyRules: (societyId) => societies.societyRepository.listRules(societyId),
      readGlobalPolicy: async () =>
        (await configReader("community_policy")) ?? DEFAULT_GLOBAL_POLICY,
      mediaBucket: config.mediaBucket ?? "",
      maxImages: config.analysisMaxImages,
      clock: systemClock,
    }),
    mode: config.contentAnalysisMode,
    policyVersion: config.contentAnalysisPolicyVersion,
    promptVersion: config.contentAnalysisPromptVersion,
    logger,
    clock: systemClock,
  });
  let reanalysisWorker: ReanalysisWorker | undefined;
  if (reanalysisQueueOptions !== undefined) {
    reanalysisWorker = new ReanalysisWorker({
      source: new SqsReanalysisMessageSource(reanalysisQueueOptions),
      runner: contentAnalysisService,
      logger,
    });
    reanalysisWorker.start();
    logger.info("content-analysis reanalysis worker started");
  }
  // Recurring scheduler that settles content-analysis runs stuck in a pending
  // state (queued/running) past the stale threshold, e.g. when a previous
  // synchronous Lambda invocation hung or was aborted. Runs not settled by a
  // pass are picked up again next tick.
  let analysisRetryTimer: NodeJS.Timeout | undefined;
  if (
    contentAnalysisService !== undefined &&
    config.contentAnalysisMode !== "off"
  ) {
    const tick = async () => {
      try {
        const retried = await contentAnalysisService.retryStaleRuns({
          staleAfterMs: config.analysisStaleAfterMs,
        });
        if (retried > 0) {
          logger.info({ retried }, "retried stale content-analysis runs");
        }
      } catch (error) {
        logger.error(
          { err: error },
          "content-analysis stale-run retry tick failed",
        );
      }
    };
    analysisRetryTimer = setInterval(tick, config.analysisRetryIntervalMs);
    analysisRetryTimer.unref();
    logger.info(
      {
        intervalMs: config.analysisRetryIntervalMs,
        staleAfterMs: config.analysisStaleAfterMs,
      },
      "content-analysis staleness retry scheduler started",
    );
  }
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
      await reanalysisWorker?.stop();
      await database.close();
      if (analysisRetryTimer !== undefined) {
        clearInterval(analysisRetryTimer);
      }
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
