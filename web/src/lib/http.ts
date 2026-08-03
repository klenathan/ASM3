interface ErrorResponse {
  error?: {
    code?: string
    message?: string
    requestId?: string
    details?: Record<string, unknown>
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'The service could not be reached. Check your connection and try again.',
    )
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null
    const error = body?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Something went wrong. Try again.',
      error?.requestId,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
