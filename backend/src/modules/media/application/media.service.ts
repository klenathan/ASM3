import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type {
  AttachMediaCommand,
  CompleteUploadCommand,
  MediaAssetDto,
  MediaAttachmentDto,
  MediaUploadDto,
  MediaUrlDto,
  RequestUploadCommand,
} from "./media.dto";
import type { ThreadAttachmentPort } from "./media.attachment";
import type { MediaRepository } from "./media.repository";
import type { MediaStoragePort } from "./media.storage";
import {
  defaultMediaPolicy,
  isMediaPurpose,
  type MediaAssetRecord,
  type MediaPolicy,
  type MediaPurpose,
} from "../domain/media";

export interface MediaServiceDependencies {
  readonly repository: MediaRepository;
  readonly storage: MediaStoragePort;
  readonly attachmentPort: ThreadAttachmentPort;
  readonly clock?: Clock;
  readonly policy?: MediaPolicy;
  readonly idGenerator?: () => string;
  /** Best-effort observer invoked when S3 cleanup fails after the DB delete committed. */
  readonly onObjectDeleteFailure?: (error: unknown, objectKey: string) => void;
}

export class MediaService {
  private readonly repository: MediaRepository;
  private readonly storage: MediaStoragePort;
  private readonly attachmentPort: ThreadAttachmentPort;
  private readonly clock: Clock;
  private readonly policy: MediaPolicy;
  private readonly idGenerator: () => string;
  private readonly onObjectDeleteFailure: (error: unknown, objectKey: string) => void;

  constructor(dependencies: MediaServiceDependencies) {
    this.repository = dependencies.repository;
    this.storage = dependencies.storage;
    this.attachmentPort = dependencies.attachmentPort;
    this.clock = dependencies.clock ?? { now: () => new Date() };
    this.policy = dependencies.policy ?? defaultMediaPolicy;
    this.idGenerator = dependencies.idGenerator ?? randomUUID;
    this.onObjectDeleteFailure = dependencies.onObjectDeleteFailure ?? (() => undefined);
  }

  async requestUpload(
    principal: RequestPrincipal,
    command: RequestUploadCommand,
  ): Promise<MediaUploadDto> {
    const purpose = this.assertPurpose(command.purpose);
    const contentType = normalizeContentType(command.contentType);
    const purposePolicy = this.policy[purpose];
    if (purposePolicy === undefined) {
      throw new ApplicationError("MEDIA_PURPOSE_NOT_ALLOWED", "The media purpose is not allowed");
    }
    if (!purposePolicy.allowedMimeTypes.includes(contentType)) {
      throw new ApplicationError("MEDIA_TYPE_NOT_ALLOWED", "The media content type is not allowed");
    }
    assertByteSize(command.byteSize, purposePolicy.maxBytes);

    const id = this.idGenerator();
    const objectKey = `media/${purpose}/${id}`;
    const instructions = await this.storage.requestUpload({
      objectKey,
      contentType,
      byteSize: command.byteSize,
    });
    const asset = await this.repository.createAsset({
      id,
      ownerId: principal.userId,
      objectKey,
      purpose,
      contentType,
      byteSize: command.byteSize,
      createdAt: this.clock.now(),
    });

    return toUploadDto(asset, instructions.uploadUrl, instructions.expiresAt);
  }

  async completeUpload(
    principal: RequestPrincipal,
    mediaId: string,
    command: CompleteUploadCommand = {},
  ): Promise<MediaAssetDto> {
    const asset = await this.assetForOwner(principal, mediaId);
    if (asset.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "The media asset was not found");
    }

    const metadata = await this.storage.headObject(asset.objectKey);
    if (metadata === null) {
      throw new ApplicationError("MEDIA_OBJECT_NOT_FOUND", "The uploaded object was not found");
    }
    this.assertObjectMetadata(asset, metadata, command.checksum);

    if (asset.status === "ready") return toAssetDto(asset);
    if (asset.status !== "pending") {
      throw new ApplicationError("MEDIA_NOT_READY", "The media asset cannot be completed");
    }

    const completed = await this.repository.completeAsset(mediaId, {
      checksum: metadata.checksum ?? null,
      completedAt: this.clock.now(),
    });
    if (completed !== null) return toAssetDto(completed);

    const current = await this.assetForOwner(principal, mediaId);
    if (current.status === "ready") return toAssetDto(current);
    throw new ApplicationError("CONFLICT", "The media asset could not be completed");
  }

  async deleteUpload(principal: RequestPrincipal, mediaId: string): Promise<void> {
    const asset = await this.assetForOwner(principal, mediaId);
    if (asset.status === "deleted") return;

    const deleted = await this.repository.deleteAsset(mediaId, this.clock.now());
    if (deleted === null) {
      throw new ApplicationError("NOT_FOUND", "The media asset was not found");
    }

    try {
      await this.storage.deleteObject(asset.objectKey);
    } catch (error) {
      this.onObjectDeleteFailure(error, asset.objectKey);
    }
  }

  async assertAvatarReadyForOwner(ownerId: string, mediaId: string): Promise<void> {
    const asset = await this.assetForOwnerId(ownerId, mediaId);
    if (asset.status !== "ready" || asset.purpose !== "avatar") {
      throw new ApplicationError(
        "MEDIA_NOT_READY",
        "The media asset is not ready to use as an avatar",
      );
    }
  }

  async assertReadyThreadAttachments(
    ownerId: string,
    mediaIds: readonly string[],
  ): Promise<void> {
    if (mediaIds.length > 20 || new Set(mediaIds).size !== mediaIds.length) {
      throw new ApplicationError("MEDIA_ATTACH_INVALID", "A thread can contain at most 20 unique media assets");
    }

    const assets = await Promise.all(mediaIds.map((mediaId) => this.assetForOwnerId(ownerId, mediaId)));
    for (const asset of assets) {
      if (asset.status !== "ready") {
        throw new ApplicationError("MEDIA_NOT_READY", "Only ready media assets can be attached");
      }
      if (asset.purpose !== "thread_attachment") {
        throw new ApplicationError("MEDIA_PURPOSE_NOT_ALLOWED", "Only thread attachments can be attached to threads");
      }
    }
  }

  async attachToThread(
    principal: RequestPrincipal,
    command: AttachMediaCommand,
  ): Promise<MediaAttachmentDto> {
    assertNonEmpty(command.threadId, "MEDIA_ATTACH_INVALID", "A thread id is required");
    if (command.mediaIds.length === 0) {
      throw new ApplicationError("MEDIA_ATTACH_INVALID", "At least one media asset is required");
    }
    await this.assertReadyThreadAttachments(principal.userId, command.mediaIds);

    await this.attachmentPort.attachMediaToThread({
      threadId: command.threadId,
      ownerId: principal.userId,
      mediaIds: [...command.mediaIds],
    });
    return { threadId: command.threadId, mediaIds: [...command.mediaIds] };
  }

  async resolveMediaUrl(mediaId: string): Promise<MediaUrlDto> {
    const asset = await this.repository.findAsset(mediaId);
    if (asset === null || asset.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "The media asset was not found");
    }
    if (asset.status !== "ready") {
      throw new ApplicationError("MEDIA_NOT_READY", "The media asset is not ready for delivery");
    }

    return {
      mediaId: asset.id,
      url: await this.storage.getObjectUrl(asset.objectKey),
    };
  }

  private assertPurpose(value: string): MediaPurpose {
    const purpose = value.trim();
    if (!isMediaPurpose(purpose) || this.policy[purpose] === undefined) {
      throw new ApplicationError("MEDIA_PURPOSE_NOT_ALLOWED", "The media purpose is not allowed");
    }
    return purpose;
  }

  private assetForOwner(
    principal: RequestPrincipal,
    mediaId: string,
  ): Promise<MediaAssetRecord> {
    return this.assetForOwnerId(principal.userId, mediaId);
  }

  private async assetForOwnerId(
    ownerId: string,
    mediaId: string,
  ): Promise<MediaAssetRecord> {
    const asset = await this.repository.findAsset(mediaId);
    if (asset === null || asset.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "The media asset was not found");
    }
    if (asset.ownerId !== ownerId) {
      throw new ApplicationError("MEDIA_NOT_OWNER", "You do not own this media asset");
    }
    return asset;
  }

  private assertObjectMetadata(
    asset: MediaAssetRecord,
    metadata: { readonly objectKey: string; readonly contentType: string; readonly byteSize: number; readonly checksum?: string | null },
    requestedChecksum: string | undefined,
  ): void {
    const actualChecksum = metadata.checksum ?? null;
    if (
      metadata.objectKey !== asset.objectKey
      || normalizeContentType(metadata.contentType) !== asset.contentType
      || metadata.byteSize !== asset.byteSize
      || (requestedChecksum !== undefined && actualChecksum !== requestedChecksum)
    ) {
      throw new ApplicationError("MEDIA_METADATA_MISMATCH", "Uploaded object metadata does not match the requested upload", {
        mediaId: asset.id,
      });
    }
  }
}

function assertByteSize(byteSize: number, maxBytes: number): void {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new ApplicationError("MEDIA_SIZE_INVALID", "Media byte size must be a positive integer");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || byteSize > maxBytes) {
    throw new ApplicationError("MEDIA_SIZE_EXCEEDED", "Media byte size exceeds the allowed limit");
  }
}

function normalizeContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

function assertNonEmpty(value: string, code: string, message: string): void {
  if (value.trim().length === 0) throw new ApplicationError(code, message);
}

function toAssetDto(asset: MediaAssetRecord): MediaAssetDto {
  return {
    id: asset.id,
    objectKey: asset.objectKey,
    purpose: asset.purpose,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksum: asset.checksum,
    status: asset.status,
    createdAt: asset.createdAt.toISOString(),
    completedAt: asset.completedAt?.toISOString() ?? null,
    deletedAt: asset.deletedAt?.toISOString() ?? null,
  };
}

function toUploadDto(
  asset: MediaAssetRecord,
  uploadUrl: string,
  expiresAt: Date | null,
): MediaUploadDto {
  return {
    ...toAssetDto(asset),
    uploadUrl,
    uploadUrlExpiresAt: expiresAt?.toISOString() ?? null,
  };
}
