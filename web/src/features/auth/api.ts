export interface User {
  readonly userId: string
  readonly email: string
  readonly displayName: string
  readonly bio: string | null
  readonly avatarMediaId: string | null
  readonly platformRole: 'student' | 'system_admin'
  readonly status: 'active' | 'suspended' | 'deactivated'
  readonly isPublic: boolean
  readonly suspendedUntil: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

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
  readonly details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new ApiError(0, 'NETWORK_ERROR', 'The service could not be reached. Check your connection and try again.')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null
    const error = body?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Something went wrong. Try again.',
      error?.requestId,
      error?.details,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function getCurrentUser(): Promise<User> {
  return request<User>('/api/v1/auth/me')
}

export function signIn(email: string, password: string): Promise<{ user: User }> {
  return request<{ user: User }>('/api/v1/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export interface RegisterInput {
  readonly displayName: string
  readonly email: string
  readonly password: string
}

export function register(input: RegisterInput): Promise<{ user: User }> {
  return request<{ user: User }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function signOut(): Promise<void> {
  return request<void>('/api/v1/auth/sign-out', { method: 'POST' })
}
