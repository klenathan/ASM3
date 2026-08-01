import * as React from "react";

import type { User } from "@/lib/api/types";
import { endpoints } from "@/lib/api/endpoints";
import { setAuthToken } from "@/lib/api/token";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: unknown;
  token: string | null;
  setToken: (token: string | null) => void;
  refresh: () => Promise<void>;
  signIn: (token: string) => Promise<User>;
  signInWithPassword: (username: string, password: string) => Promise<User>;
  signUp: (payload: {
    email: string;
    password: string;
    display_name: string;
    major: string;
  }) => Promise<{ username: string; confirmation_required: boolean }>;
  confirmSignUp: (
    username: string,
    password: string,
    confirmationCode: string
  ) => Promise<User>;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const setToken = React.useCallback((next: string | null) => {
    setAuthToken(next);
    setTokenState(next);
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await endpoints.me.bootstrap();
      setUser(me);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const completeSignIn = React.useCallback(async (next: string) => {
    setAuthToken(next);
    setTokenState(next);
    setLoading(true);
    setError(null);
    try {
      const me = await endpoints.me.bootstrap();
      setUser(me);
      return me;
    } catch (err) {
      setAuthToken(null);
      setTokenState(null);
      setUser(null);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = React.useCallback(
    (next: string) => completeSignIn(next),
    [completeSignIn]
  );

  const signInWithPassword = React.useCallback(
    async (username: string, password: string) => {
      const tokens = await endpoints.auth.signIn(username, password);
      return completeSignIn(tokens.access_token);
    },
    [completeSignIn]
  );

  const signUp = React.useCallback(
    async (payload: {
      email: string;
      password: string;
      display_name: string;
      major: string;
    }) => {
      return endpoints.auth.signUp(payload);
    },
    []
  );

  const confirmSignUp = React.useCallback(
    async (username: string, password: string, confirmationCode: string) => {
      const tokens = await endpoints.auth.confirm(
        username,
        password,
        confirmationCode
      );
      return completeSignIn(tokens.access_token);
    },
    [completeSignIn]
  );

  const signOut = React.useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setToken]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      token,
      setToken,
      refresh,
      signIn,
      signInWithPassword,
      signUp,
      confirmSignUp,
      signOut,
    }),
    [
      user,
      loading,
      error,
      token,
      setToken,
      refresh,
      signIn,
      signInWithPassword,
      signUp,
      confirmSignUp,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
