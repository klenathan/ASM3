import type { MediaAssetRecord, MediaPurpose } from "../domain/media";

export interface RequestUploadCommand {
  readonly purpose: string;
  readonly contentType: string;
  readonly byteSize: number;
}

export interface CompleteUploadCommand {
  readonly checksum?: string;
}

export interface AttachMediaCommand {
  readonly threadId: string;
  readonly mediaIds: readonly string[];
}

export interface MediaAssetDto {
  readonly id: string;
  readonly objectKey: string;
  readonly purpose: MediaPurpose;
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksum: string | null;
  readonly status: MediaAssetRecord["status"];
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly deletedAt: string | null;
}

export interface MediaUploadDto extends MediaAssetDto {
  readonly uploadUrl: string;
  readonly uploadUrlExpiresAt: string | null;
}

export interface MediaAttachmentDto {
  readonly threadId: string;
  readonly mediaIds: readonly string[];
}

export interface MediaUrlDto {
  readonly mediaId: string;
  readonly url: string;
}
