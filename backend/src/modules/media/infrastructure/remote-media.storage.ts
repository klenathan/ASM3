import type {
  MediaStoragePort,
  RequestUploadInput,
  StoredObjectMetadata,
  UploadInstructions,
} from "../application/media.storage";

/**
 * Read-only backing for seeded media whose object keys are full remote URLs
 * (e.g. https://picsum.photos/...).
 *
 * Seed rows store the public image URL inside media_assets.object_key and are
 * marked status = 'ready'. getObjectUrl resolves those keys back to the URL so
 * the existing `GET /media/:id/url` flow keeps working without a real S3/CDN.
 *
 * When a writable storage adapter is supplied, non-remote keys are delegated to
 * it. This keeps seeded URL assets readable while local and deployed uploads use
 * the configured S3 bucket.
 */
export class RemoteMediaStorage implements MediaStoragePort {
  private readonly writableStorage: MediaStoragePort | undefined;

  constructor(writableStorage?: MediaStoragePort) {
    this.writableStorage = writableStorage;
  }

  async requestUpload(input: RequestUploadInput): Promise<UploadInstructions> {
    if (this.writableStorage !== undefined) {
      return this.writableStorage.requestUpload(input);
    }
    throw new Error("Remote media storage is read-only for seeded assets");
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    if (isRemoteUrl(objectKey)) {
      return { objectKey, contentType: "image/jpeg", byteSize: 1 };
    }
    return this.writableStorage?.headObject(objectKey) ?? null;
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (isRemoteUrl(objectKey)) {
      throw new Error("Seeded remote media cannot be deleted from object storage");
    }
    if (this.writableStorage !== undefined) {
      await this.writableStorage.deleteObject(objectKey);
      return;
    }
    throw new Error("Remote media storage is read-only for seeded assets");
  }

  async getObjectUrl(objectKey: string): Promise<string> {
    if (isRemoteUrl(objectKey)) return objectKey;
    if (this.writableStorage !== undefined) {
      return this.writableStorage.getObjectUrl(objectKey);
    }
    throw new Error(
      `Remote media storage cannot resolve a non-remote key: "${objectKey}"`,
    );
  }
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}
