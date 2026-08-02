import type { Database } from "../../db/client";
import { systemClock, type Clock } from "../../shared/application/clock";
import { MediaService } from "./application/media.service";
import type { ThreadAttachmentPort } from "./application/media.attachment";
import type { MediaStoragePort } from "./application/media.storage";
import { DrizzleMediaRepository } from "./infrastructure/drizzle-media.repository";

export interface MediaModuleDependencies {
  readonly database: Database;
  readonly storage: MediaStoragePort;
  readonly attachmentPort: ThreadAttachmentPort;
  readonly clock?: Clock;
}

export function createMediaModule(dependencies: MediaModuleDependencies) {
  const repository = new DrizzleMediaRepository(dependencies.database);
  const mediaService = new MediaService({
    repository,
    storage: dependencies.storage,
    attachmentPort: dependencies.attachmentPort,
    clock: dependencies.clock ?? systemClock,
  });
  return { repository, mediaService };
}

export { MediaService } from "./application/media.service";
export { UnconfiguredMediaStorage } from "./application/media.storage";
export type { MediaStoragePort } from "./application/media.storage";
export type { ThreadAttachmentPort } from "./application/media.attachment";
export { registerMediaRoutes } from "./presentation/media.routes";
export type { MediaRouteDependencies } from "./presentation/media.routes";
