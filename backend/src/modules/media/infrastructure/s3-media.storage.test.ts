import {
  DeleteObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { createS3MediaClient, S3MediaStorage } from "./s3-media.storage";

function storageWith(send: ReturnType<typeof vi.fn>) {
  return new S3MediaStorage({
    bucket: "rmit-society-media",
    region: "us-east-1",
    client: { send } as unknown as S3Client,
  });
}

describe("S3MediaStorage", () => {
  it("disables optional checksums that would sign an empty presign payload", async () => {
    const client = createS3MediaClient("us-east-1");

    await expect(client.config.requestChecksumCalculation()).resolves.toBe("WHEN_REQUIRED");
    client.destroy();
  });

  it("reads object metadata used to verify a completed upload", async () => {
    const send = vi.fn().mockResolvedValue({
      ContentType: "image/webp",
      ContentLength: 2_048,
      ChecksumSHA256: "checksum",
    });
    const storage = storageWith(send);

    await expect(storage.headObject("media/thread_attachment/id")).resolves.toEqual({
      objectKey: "media/thread_attachment/id",
      contentType: "image/webp",
      byteSize: 2_048,
      checksum: "checksum",
    });
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({
      Bucket: "rmit-society-media",
      Key: "media/thread_attachment/id",
    });
  });

  it("maps S3 missing-object responses to null", async () => {
    const send = vi.fn().mockRejectedValue({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });

    await expect(storageWith(send).headObject("missing")).resolves.toBeNull();
  });

  it("deletes the remote object", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = storageWith(send);

    await storage.deleteObject("media/thread_attachment/id");
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
