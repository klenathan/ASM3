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
  createAsset(input: CreateMediaAssetInput): Promise<MediaAssetRecord>;
  completeAsset(
    mediaId: string,
    input: CompleteMediaAssetInput,
  ): Promise<MediaAssetRecord | null>;
  deleteAsset(mediaId: string, deletedAt: Date): Promise<MediaAssetRecord | null>;
}
