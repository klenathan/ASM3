import { ApiError, request } from "../../lib/http"

export interface MediaUrl {
  readonly mediaId: string
  readonly url: string
  readonly contentType: string | null
}

export interface MediaAsset {
  readonly id: string
  readonly objectKey: string
  readonly purpose: "thread_attachment" | "avatar"
  readonly contentType: string
  readonly byteSize: number
  readonly checksum: string | null
  readonly status: "pending" | "uploading" | "ready" | "quarantined" | "failed" | "deleted"
  readonly createdAt: string
  readonly completedAt: string | null
  readonly deletedAt: string | null
}

interface MediaUpload extends MediaAsset {
  readonly uploadUrl: string
  readonly uploadUrlExpiresAt: string | null
}

interface MediaUploadBatch {
  readonly uploads: readonly MediaUpload[]
}

interface MediaBatchResult {
  readonly items: readonly {
    readonly mediaId: string
    readonly status: "ready" | "failed"
    readonly code?: string
    readonly message?: string
  }[]
}

/** Upper bound on parallel direct S3 PUTs issued from the browser. */
const UPLOAD_CONCURRENCY = 3

/**
 * Per-attempt timeout for a direct S3 PUT. Retries and the concurrency window
 * must stay comfortably under the 5-minute presigned-upload expiry issued by
 * the backend (see backend s3-media.storage.ts), so 3 attempts x 60s fits.
 */
const UPLOAD_TIMEOUT_MS = 60_000

/** How many times a single object may be PUT to S3 before giving up. */
const UPLOAD_MAX_ATTEMPTS = 3

/** Delay between retries, scaled by the attempt number. */
const UPLOAD_RETRY_DELAY_MS = 1_000

/** Status codes worth retrying as transient S3/server hiccups. */
function isRetryableUploadStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/**
 * PUTs a file to S3 with a per-attempt timeout and bounded retries. Retries
 * happen on network failures, timeouts, and transient server responses; other
 * client errors fail fast. Returns true once the object is accepted by S3.
 */
async function putToS3(uploadUrl: string, file: File): Promise<boolean> {
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      })
      if (response.ok) return true
      if (!isRetryableUploadStatus(response.status)) return false
    } catch (error) {
      // A timeout (AbortError) or network failure is retryable.
      if (error instanceof Error && error.name === "AbortError") {
        /* fall through to retry */
      } else if (error instanceof ApiError) {
        throw error
      }
    }

    if (attempt < UPLOAD_MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, UPLOAD_RETRY_DELAY_MS * attempt),
      )
    }
  }
  return false
}

export function fetchMediaUrl(mediaId: string): Promise<MediaUrl> {
  return request<MediaUrl>(`/api/v1/media/${encodeURIComponent(mediaId)}/url`)
}

export function uploadAvatar(file: File): Promise<MediaAsset> {
  return uploadSingle("avatar", file)
}

/**
 * Uploads a batch of thread images in one round trip: a single manifest request
 * yields one presigned URL per file, the browser PUTs them to S3 with a bounded
 * concurrency, then one batch-complete call verifies every object. Resolves to
 * the ready media ids (in original file order).
 */
export async function uploadThreadImages(files: readonly File[]): Promise<string[]> {
  if (files.length === 0) return []

  const batch = await request<MediaUploadBatch>("/api/v1/media/uploads/batch", {
    method: "POST",
    body: JSON.stringify({
      purpose: "thread_attachment",
      files: files.map((file) => ({
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
      })),
    }),
  })

  const uploads = batch.uploads
  const successfulIds = await putToS3WithConcurrency(files, uploads)

  if (successfulIds.length < files.length) {
    await Promise.allSettled(uploads.map((upload) => deleteMediaUpload(upload.id)))
    throw new ApiError(
      0,
      "MEDIA_UPLOAD_FAILED",
      "Some images did not reach the media store. Try again.",
    )
  }

  const result = await request<MediaBatchResult>("/api/v1/media/uploads/complete-batch", {
    method: "POST",
    body: JSON.stringify({ mediaIds: successfulIds }),
  })

  const rejected = result.items.filter((item) => item.status !== "ready")
  if (rejected.length > 0) {
    await Promise.allSettled(successfulIds.map((mediaId) => deleteMediaUpload(mediaId)))
    throw new ApiError(
      0,
      "MEDIA_UPLOAD_FAILED",
      "Some images were rejected after upload. Try again.",
    )
  }

  return uploads
    .filter((upload) => successfulIds.includes(upload.id))
    .map((upload) => upload.id)
}

/**
 * Direct-upload helper with a concurrency limit. Returns the ids that uploaded
 * successfully, preserving traversal order for bookkeeping.
 */
async function putToS3WithConcurrency(
  files: readonly File[],
  uploads: readonly MediaUpload[],
): Promise<string[]> {
  const successfulIds: string[] = []
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, files.length) },
    async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= files.length) return
        const file = files[index]!
        const upload = uploads[index]!
        if (await putToS3(upload.uploadUrl, file)) successfulIds.push(upload.id)
      }
    },
  )

  await Promise.all(workers)
  return successfulIds
}

async function uploadSingle(
  purpose: MediaAsset["purpose"],
  file: File,
): Promise<MediaAsset> {
  const upload = await request<MediaUpload>("/api/v1/media/uploads", {
    method: "POST",
    body: JSON.stringify({
      purpose,
      contentType: file.type,
      byteSize: file.size,
    }),
  })

  try {
    const uploaded = await putToS3(upload.uploadUrl, file)
    if (!uploaded) {
      throw new ApiError(
        0,
        "MEDIA_UPLOAD_FAILED",
        `S3 rejected ${file.name}. Try the upload again.`,
      )
    }

    return await request<MediaAsset>(
      `/api/v1/media/uploads/${encodeURIComponent(upload.id)}/complete`,
      { method: "POST", body: JSON.stringify({}) },
    )
  } catch (error) {
    await deleteMediaUpload(upload.id).catch(() => undefined)
    if (error instanceof ApiError) throw error
    throw new ApiError(
      0,
      "MEDIA_UPLOAD_FAILED",
      `${file.name} could not be uploaded. Check your connection and try again.`,
    )
  }
}

export function deleteMediaUpload(mediaId: string): Promise<void> {
  return request<void>(`/api/v1/media/uploads/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
  })
}
