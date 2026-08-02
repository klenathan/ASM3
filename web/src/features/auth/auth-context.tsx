import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  ApiError,
  getCurrentUser,
  register as registerRequest,
  signIn as signInRequest,
  signOut as signOutRequest,
  type RegisterInput,
  type User,
} from './api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden'

interface AuthContextValue {
  readonly status: AuthStatus
  readonly user: User | null
  readonly error: ApiError | null
  readonly signIn: (email: string, password: string) => Promise<User>
  readonly register: (input: RegisterInput) => Promise<User>
  readonly signOut: () => Promise<void>
  readonly refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SESSION_RESTORE_HINT_KEY = 'rmit-session-restore'

function setSessionRestoreHint(isPresent: boolean): void {
  try {
    if (isPresent) {
      window.localStorage.setItem(SESSION_RESTORE_HINT_KEY, 'true')
    } else {
      window.localStorage.removeItem(SESSION_RESTORE_HINT_KEY)
    }
  } catch {
    // Session restoration remains available for current page when storage is unavailable.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const hasRestoredSession = useRef(false)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const currentUser = await getCurrentUser()
      setSessionRestoreHint(true)
      setUser(currentUser)
      setStatus('authenticated')
    } catch (caughtError) {
      const nextError = caughtError instanceof ApiError
        ? caughtError
        : new ApiError(0, 'UNKNOWN_ERROR', 'Unable to check your session.')
      if (nextError.status === 401) setSessionRestoreHint(false)
      setUser(null)
      setError(nextError)
      setStatus(nextError.status === 403 ? 'forbidden' : 'unauthenticated')
    }
  }, [])

  useEffect(() => {
    if (hasRestoredSession.current) return
    hasRestoredSession.current = true
    void refresh()
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInRequest(email, password)
    setSessionRestoreHint(true)
    setUser(result.user)
    setError(null)
    setStatus('authenticated')
    return result.user
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const result = await registerRequest(input)
    setSessionRestoreHint(true)
    setUser(result.user)
    setError(null)
    setStatus('authenticated')
    return result.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      await signOutRequest()
    } finally {
      setSessionRestoreHint(false)
      setUser(null)
      setError(null)
      setStatus('unauthenticated')
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, error, signIn, register, signOut, refresh }),
    [error, refresh, register, signIn, signOut, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('useAuth must be used within AuthProvider')
  return context
}
