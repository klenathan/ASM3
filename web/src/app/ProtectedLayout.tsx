import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { TopBar } from "../components/site/TopBar";
import { useAuth } from "../features/auth/auth-context";
import { SocietyIndex } from "../features/societies/society-index";
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
      <div className="mx-auto grid w-full  flex-1 px-6 py-10 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:px-10 lg:py-14">
        <aside
          aria-label="Society index"
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <SocietyIndex />
        </aside>
        <div className="min-w-0">{children ?? <Outlet />}</div>
      </div>
    </div>
  );
}
