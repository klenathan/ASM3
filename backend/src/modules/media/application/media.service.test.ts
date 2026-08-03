import { describe, expect, it } from "vitest";

import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { ThreadAttachmentPort } from "./media.attachment";
import type {
  CompleteMediaAssetInput,
  CreateMediaAssetInput,
  MediaRepository,
} from "./media.repository";
import { MediaService } from "./media.service";
import type {
  MediaStoragePort,
  RequestUploadInput,
  StoredObjectMetadata,
} from "./media.storage";
import type { MediaAssetRecord } from "../domain/media";

const principal: RequestPrincipal = { userId: "owner-id", platformRole: "student" };
const now = new Date("2026-04-01T00:00:00.000Z");

describe("MediaService", () => {
  it("requests, verifies, and completes a direct image upload", async () => {
    const repository = new FakeMediaRepository();
    const storage = new FakeMediaStorage();
    const service = createService(repository, storage);

    const upload = await service.requestUpload(principal, {
      purpose: "thread_attachment",
      contentType: "image/png",
      byteSize: 512,
    });

    expect(storage.requested).toEqual({
      objectKey: `media/thread_attachment/${upload.id}`,
      contentType: "image/png",
      byteSize: 512,
    });
    storage.metadata = {
      objectKey: upload.objectKey,
      contentType: "image/png",
      byteSize: 512,
    };

    await expect(service.completeUpload(principal, upload.id)).resolves.toMatchObject({
      id: upload.id,
      status: "ready",
      completedAt: now.toISOString(),
    });
    await expect(
      service.assertReadyThreadAttachments(principal.userId, [upload.id]),
    ).resolves.toBeUndefined();
  });

  it("rejects uploaded objects whose S3 metadata differs from the request", async () => {
    const repository = new FakeMediaRepository();
    const storage = new FakeMediaStorage();
    const service = createService(repository, storage);
    const upload = await service.requestUpload(principal, {
      purpose: "thread_attachment",
      contentType: "image/webp",
      byteSize: 1_024,
    });
    storage.metadata = {
      objectKey: upload.objectKey,
      contentType: "image/webp",
      byteSize: 2_048,
    };

    await expect(service.completeUpload(principal, upload.id)).rejects.toMatchObject({
      code: "MEDIA_METADATA_MISMATCH",
    });
    expect(repository.assets.get(upload.id)?.status).toBe("pending");
  });

  it("rejects attachment references owned by another user", async () => {
    const repository = new FakeMediaRepository();
    repository.assets.set("foreign-media", asset({
      id: "foreign-media",
      ownerId: "another-owner",
      status: "ready",
    }));
    const service = createService(repository, new FakeMediaStorage());

    await expect(
      service.assertReadyThreadAttachments(principal.userId, ["foreign-media"]),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_OWNER" });
  });
});

function createService(repository: MediaRepository, storage: MediaStoragePort): MediaService {
  return new MediaService({
    repository,
    storage,
    attachmentPort: noAttachments,
    clock: { now: () => now },
    idGenerator: () => "00000000-0000-4000-8000-000000000001",
  });
}

const noAttachments: ThreadAttachmentPort = {
  attachMediaToThread: async () => undefined,
};

class FakeMediaStorage implements MediaStoragePort {
  requested: RequestUploadInput | null = null;
  metadata: StoredObjectMetadata | null = null;

  async requestUpload(input: RequestUploadInput) {
    this.requested = input;
    return {
      uploadUrl: "https://uploads.example.test/signed",
      expiresAt: new Date("2026-04-01T00:05:00.000Z"),
    };
  }

  async headObject(): Promise<StoredObjectMetadata | null> {
    return this.metadata;
  }

  async deleteObject(): Promise<void> {}

  async getObjectUrl(): Promise<string> {
    return "https://downloads.example.test/signed";
  }
}

class FakeMediaRepository implements MediaRepository {
  readonly assets = new Map<string, MediaAssetRecord>();

  async findAsset(mediaId: string): Promise<MediaAssetRecord | null> {
    return this.assets.get(mediaId) ?? null;
  }

  async createAsset(input: CreateMediaAssetInput): Promise<MediaAssetRecord> {
    const created = asset({
      ...input,
      checksum: null,
      status: "pending",
      completedAt: null,
      deletedAt: null,
    });
    this.assets.set(created.id, created);
    return created;
  }

  async completeAsset(
    mediaId: string,
    input: CompleteMediaAssetInput,
  ): Promise<MediaAssetRecord | null> {
    const current = this.assets.get(mediaId);
    if (current === undefined || current.status !== "pending") return null;
    const completed = asset({
      ...current,
      status: "ready",
      checksum: input.checksum,
      completedAt: input.completedAt,
    });
    this.assets.set(mediaId, completed);
    return completed;
  }

  async deleteAsset(mediaId: string, deletedAt: Date): Promise<MediaAssetRecord | null> {
    const current = this.assets.get(mediaId);
    if (current === undefined) return null;
    const deleted = asset({ ...current, status: "deleted", deletedAt });
    this.assets.set(mediaId, deleted);
    return deleted;
  }
}

function asset(overrides: Partial<MediaAssetRecord> & Pick<MediaAssetRecord, "id">): MediaAssetRecord {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? principal.userId,
    objectKey: overrides.objectKey ?? `media/thread_attachment/${overrides.id}`,
    purpose: overrides.purpose ?? "thread_attachment",
    contentType: overrides.contentType ?? "image/png",
    byteSize: overrides.byteSize ?? 512,
    checksum: overrides.checksum ?? null,
    status: overrides.status ?? "pending",
    createdAt: overrides.createdAt ?? now,
    completedAt: overrides.completedAt ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}
