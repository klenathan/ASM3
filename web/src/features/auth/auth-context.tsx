import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, getCurrentUser, signIn as signInRequest, signOut as signOutRequest, type User } from './api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden'

interface AuthContextValue {
  readonly status: AuthStatus
  readonly user: User | null
  readonly error: ApiError | null
  readonly signIn: (email: string, password: string) => Promise<User>
  readonly signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setStatus('authenticated')
    } catch (caughtError) {
      const nextError = caughtError instanceof ApiError
        ? caughtError
        : new ApiError(0, 'UNKNOWN_ERROR', 'Unable to check your session.')
      setUser(null)
      setError(nextError)
      setStatus(nextError.status === 403 ? 'forbidden' : 'unauthenticated')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInRequest(email, password)
    setUser(result.user)
    setError(null)
    setStatus('authenticated')
    return result.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      await signOutRequest()
    } finally {
      setUser(null)
      setError(null)
      setStatus('unauthenticated')
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ status, user, error, signIn, signOut }), [error, signIn, signOut, status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('useAuth must be used within AuthProvider')
  return context
}
