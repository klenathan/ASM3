import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../../../db/client";
import { ApplicationError } from "../../../shared/domain/errors";
import type {
  CompleteMediaAssetInput,
  CreateMediaAssetInput,
  MediaRepository,
} from "../application/media.repository";
import {
  isMediaAssetStatus,
  isMediaPurpose,
  type MediaAssetRecord,
} from "../domain/media";
import { mediaAssets } from "./media.tables";

type MediaExecutor = Pick<Database, "select" | "insert" | "update">;

export class DrizzleMediaRepository implements MediaRepository {
  private readonly executor: MediaExecutor;

  constructor(executor: MediaExecutor) {
    this.executor = executor;
  }

  async findAsset(mediaId: string): Promise<MediaAssetRecord | null> {
    const rows = await this.executor
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toMediaAsset(row);
  }

  async createAsset(input: CreateMediaAssetInput): Promise<MediaAssetRecord> {
    const rows = await this.executor
      .insert(mediaAssets)
      .values({
        ...input,
        checksum: null,
        status: "pending",
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new ApplicationError("MEDIA_DATA_INVALID", "The media asset could not be created");
    }
    return toMediaAsset(row);
  }

  async completeAsset(
    mediaId: string,
    input: CompleteMediaAssetInput,
  ): Promise<MediaAssetRecord | null> {
    const rows = await this.executor
      .update(mediaAssets)
      .set({ status: "ready", checksum: input.checksum, completedAt: input.completedAt })
      .where(and(
        eq(mediaAssets.id, mediaId),
        eq(mediaAssets.status, "pending"),
        isNull(mediaAssets.deletedAt),
      ))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toMediaAsset(row);
  }

  async deleteAsset(mediaId: string, deletedAt: Date): Promise<MediaAssetRecord | null> {
    const rows = await this.executor
      .update(mediaAssets)
      .set({ status: "deleted", deletedAt })
      .where(and(eq(mediaAssets.id, mediaId), isNull(mediaAssets.deletedAt)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toMediaAsset(row);
  }
}

function toMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAssetRecord {
  if (!isMediaPurpose(row.purpose) || !isMediaAssetStatus(row.status)) {
    throw new ApplicationError("MEDIA_DATA_INVALID", "The media asset contains an invalid state");
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    objectKey: row.objectKey,
    purpose: row.purpose,
    contentType: row.contentType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    deletedAt: row.deletedAt,
  };
}
