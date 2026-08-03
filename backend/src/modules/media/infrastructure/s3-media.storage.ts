import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  MediaStoragePort,
  RequestUploadInput,
  StoredObjectMetadata,
  UploadInstructions,
} from "../application/media.storage";

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 5 * 60;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60 * 60;

export interface S3MediaStorageOptions {
  readonly bucket: string;
  readonly region: string;
  readonly client?: S3Client;
  readonly now?: () => Date;
  readonly uploadExpirySeconds?: number;
  readonly downloadExpirySeconds?: number;
}

export class S3MediaStorage implements MediaStoragePort {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly now: () => Date;
  private readonly uploadExpirySeconds: number;
  private readonly downloadExpirySeconds: number;

  constructor(options: S3MediaStorageOptions) {
    this.bucket = options.bucket;
    this.client = options.client ?? createS3MediaClient(options.region);
    this.now = options.now ?? (() => new Date());
    this.uploadExpirySeconds = options.uploadExpirySeconds ?? DEFAULT_UPLOAD_EXPIRY_SECONDS;
    this.downloadExpirySeconds = options.downloadExpirySeconds ?? DEFAULT_DOWNLOAD_EXPIRY_SECONDS;
  }

  async requestUpload(input: RequestUploadInput): Promise<UploadInstructions> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadExpirySeconds,
    });

    return {
      uploadUrl,
      expiresAt: new Date(this.now().getTime() + this.uploadExpirySeconds * 1_000),
    };
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }));
      return {
        objectKey,
        contentType: result.ContentType ?? "",
        byteSize: result.ContentLength ?? 0,
        checksum: result.ChecksumSHA256 ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
  }

  async getObjectUrl(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: this.downloadExpirySeconds },
    );
  }
}

export function createS3MediaClient(region: string): S3Client {
  return new S3Client({
    region,
    // Presigning has no request body. SDK default checksum middleware otherwise
    // signs CRC32 for an empty payload, then S3 rejects the browser's real file.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly name?: string;
    readonly $metadata?: { readonly httpStatusCode?: number };
  };
  return candidate.name === "NotFound"
    || candidate.name === "NoSuchKey"
    || candidate.$metadata?.httpStatusCode === 404;
}
