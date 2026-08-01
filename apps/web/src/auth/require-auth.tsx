import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Spinner } from "@/components/ui/spinner";

import { useAuth } from "./auth-provider";

export function RequireAuth() {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Checking your session"
        className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner className="size-5" />
        Checking your session…
      </div>
    );
  }

  if (!token || !user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}
