export interface RequestUploadInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteSize: number;
}

export interface UploadInstructions {
  readonly uploadUrl: string;
  readonly expiresAt: Date | null;
}

export interface StoredObjectMetadata {
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksum?: string | null;
}

export interface MediaStoragePort {
  requestUpload(input: RequestUploadInput): Promise<UploadInstructions>;
  headObject(objectKey: string): Promise<StoredObjectMetadata | null>;
  deleteObject(objectKey: string): Promise<void>;
  getObjectUrl(objectKey: string): Promise<string>;
}

/**
 * The composition root must replace this adapter with an S3 implementation in
 * deployed environments. Keeping the failure explicit prevents pretending that
 * a database row represents an object that was never uploaded.
 */
export class UnconfiguredMediaStorage implements MediaStoragePort {
  async requestUpload(): Promise<UploadInstructions> {
    throw new Error("Media storage is not configured");
  }

  async headObject(): Promise<StoredObjectMetadata | null> {
    throw new Error("Media storage is not configured");
  }

  async deleteObject(): Promise<void> {
    throw new Error("Media storage is not configured");
  }

  async getObjectUrl(): Promise<string> {
    throw new Error("Media storage is not configured");
  }
}
