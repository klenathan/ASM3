import { and, eq, inArray, isNull, sql } from "drizzle-orm";

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

  async findAssets(mediaIds: readonly string[]): Promise<MediaAssetRecord[]> {
    if (mediaIds.length === 0) return [];
    const rows = await this.executor
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, [...mediaIds]));
    return rows.map(toMediaAsset);
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

  async markUploading(mediaIds: readonly string[]): Promise<number> {
    if (mediaIds.length === 0) return 0;
    const rows = await this.executor
      .update(mediaAssets)
      .set({ status: "uploading" })
      .where(and(
        inArray(mediaAssets.id, [...mediaIds]),
        sql`${mediaAssets.status} in ('pending', 'failed')`,
        isNull(mediaAssets.deletedAt),
      ))
      .returning();
    return rows.length;
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
        sql`${mediaAssets.status} in ('pending', 'uploading')`,
        isNull(mediaAssets.deletedAt),
      ))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toMediaAsset(row);
  }

  async markFailed(mediaId: string): Promise<MediaAssetRecord | null> {
    const rows = await this.executor
      .update(mediaAssets)
      .set({ status: "failed" })
      .where(and(
        eq(mediaAssets.id, mediaId),
        sql`${mediaAssets.status} in ('pending', 'uploading')`,
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
