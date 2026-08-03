import { ApiError, request } from "../../lib/http"

export interface MediaUrl {
  readonly mediaId: string
  readonly url: string
}

export interface MediaAsset {
  readonly id: string
  readonly objectKey: string
  readonly purpose: "thread_attachment" | "avatar"
  readonly contentType: string
  readonly byteSize: number
  readonly checksum: string | null
  readonly status: "pending" | "ready" | "quarantined" | "deleted"
  readonly createdAt: string
  readonly completedAt: string | null
  readonly deletedAt: string | null
}

interface MediaUpload extends MediaAsset {
  readonly uploadUrl: string
  readonly uploadUrlExpiresAt: string | null
}

export function fetchMediaUrl(mediaId: string): Promise<MediaUrl> {
  return request<MediaUrl>(`/api/v1/media/${encodeURIComponent(mediaId)}/url`)
}

export async function uploadThreadImage(file: File): Promise<MediaAsset> {
  const upload = await request<MediaUpload>("/api/v1/media/uploads", {
    method: "POST",
    body: JSON.stringify({
      purpose: "thread_attachment",
      contentType: file.type,
      byteSize: file.size,
    }),
  })

  try {
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    })
    if (!response.ok) {
      throw new ApiError(
        response.status,
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
