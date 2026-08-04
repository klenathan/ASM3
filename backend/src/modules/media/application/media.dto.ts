import type { MediaAssetRecord, MediaPurpose } from "../domain/media";

export interface RequestUploadCommand {
  readonly purpose: string;
  readonly contentType: string;
  readonly byteSize: number;
}

export interface RequestUploadFile {
  readonly contentType: string;
  readonly byteSize: number;
}

export interface RequestUploadBatchCommand {
  readonly purpose: string;
  readonly files: readonly RequestUploadFile[];
}

export interface CompleteUploadCommand {
  readonly checksum?: string;
}

export interface CompleteUploadBatchCommand {
  readonly mediaIds: readonly string[];
}

export interface MediaBatchResultDto {
  readonly items: readonly MediaBatchResultItemDto[];
}

export interface MediaBatchResultItemDto {
  readonly mediaId: string;
  readonly status: "ready" | "failed";
  readonly code?: string;
  readonly message?: string;
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
  readonly contentType: string;
}
