export const MEDIA_PURPOSES = ["thread_attachment", "avatar"] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export type MediaAssetStatus = "pending" | "ready" | "quarantined" | "deleted";

export interface MediaPurposePolicy {
  readonly allowedMimeTypes: readonly string[];
  readonly maxBytes: number;
}

export type MediaPolicy = Readonly<Record<MediaPurpose, MediaPurposePolicy>>;

// These defaults are deliberately small for the coursework deployment. Direct uploads do not
// pass through the API body limit, so the service must enforce the limits itself.
export const defaultMediaPolicy: MediaPolicy = {
  thread_attachment: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  avatar: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
};

export interface MediaAssetRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly objectKey: string;
  readonly purpose: MediaPurpose;
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksum: string | null;
  readonly status: MediaAssetStatus;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly deletedAt: Date | null;
}

export function isMediaPurpose(value: string): value is MediaPurpose {
  return (MEDIA_PURPOSES as readonly string[]).includes(value);
}

export function isMediaAssetStatus(value: string): value is MediaAssetStatus {
  return ["pending", "ready", "quarantined", "deleted"].includes(value);
}
