import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { TopBar } from "../components/site/TopBar";
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

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex w-full flex-1">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
