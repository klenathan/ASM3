import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../../../db/client";
import { ApplicationError } from "../../../shared/domain/errors";
import type {
  AttachMediaToThreadInput,
  ThreadAttachmentPort,
} from "../../media/application/media.attachment";
import { mediaAssets } from "../../media/infrastructure/media.tables";
import { threadMedia, threads } from "./discussion.tables";

export class DrizzleThreadAttachmentAdapter implements ThreadAttachmentPort {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async attachMediaToThread(input: AttachMediaToThreadInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const threadRows = await transaction
        .select({ authorId: threads.authorId })
        .from(threads)
        .where(eq(threads.id, input.threadId))
        .limit(1);
      if (threadRows[0] === undefined) {
        throw new ApplicationError("NOT_FOUND", "The thread was not found");
      }
      if (threadRows[0].authorId !== input.ownerId) {
        throw new ApplicationError("MEDIA_NOT_OWNER", "Only the thread author can attach media");
      }

      const assets = await transaction
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(
          inArray(mediaAssets.id, input.mediaIds),
          eq(mediaAssets.ownerId, input.ownerId),
          eq(mediaAssets.status, "ready"),
        ));
      if (assets.length !== input.mediaIds.length) {
        throw new ApplicationError("MEDIA_NOT_READY", "Every media asset must be ready and owned by the thread author");
      }

      await transaction.delete(threadMedia).where(eq(threadMedia.threadId, input.threadId));
      await transaction.insert(threadMedia).values(
        input.mediaIds.map((mediaId, position) => ({
          threadId: input.threadId,
          mediaId,
          position,
        })),
      );
    });
  }
}
