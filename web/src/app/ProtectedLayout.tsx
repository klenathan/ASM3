import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../features/auth/auth-context";
import { ForbiddenPage, LoadingPage } from "../pages/status";

export function ProtectedLayout({ children }: { children?: ReactNode }) {
  const { status, error } = useAuth();
  const location = useLocation();

  if (status === "loading")
    return <LoadingPage label="Opening your societies" />;
  if (status === "forbidden") return <ForbiddenPage detail={error?.message} />;
  if (status !== "authenticated") {
    return (
      <Navigate
        to="/401"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children ?? <Outlet />;
}
