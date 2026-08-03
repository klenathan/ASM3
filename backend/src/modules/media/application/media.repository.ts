import type { MediaAssetRecord } from "../domain/media";

export interface CreateMediaAssetInput {
  readonly id: string;
  readonly ownerId: string;
  readonly objectKey: string;
  readonly purpose: MediaAssetRecord["purpose"];
  readonly contentType: string;
  readonly byteSize: number;
  readonly createdAt: Date;
}

export interface CompleteMediaAssetInput {
  readonly checksum: string | null;
  readonly completedAt: Date;
}

export interface MediaRepository {
  findAsset(mediaId: string): Promise<MediaAssetRecord | null>;
  findAssets(mediaIds: readonly string[]): Promise<MediaAssetRecord[]>;
  createAsset(input: CreateMediaAssetInput): Promise<MediaAssetRecord>;
  markUploading(mediaIds: readonly string[]): Promise<number>;
  completeAsset(
    mediaId: string,
    input: CompleteMediaAssetInput,
  ): Promise<MediaAssetRecord | null>;
  markFailed(mediaId: string): Promise<MediaAssetRecord | null>;
  deleteAsset(mediaId: string, deletedAt: Date): Promise<MediaAssetRecord | null>;
}
