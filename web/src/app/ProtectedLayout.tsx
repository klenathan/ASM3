import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { TopBar } from "../components/site/TopBar";
import { useAuth } from "../features/auth/auth-context";
import { SocietyIndex } from "../features/societies/society-index";
import { ForbiddenPage, LoadingPage } from "../pages/status";

export function ProtectedLayout({
  children,
  withLayout = true,
}: {
  children?: ReactNode;
  withLayout?: boolean;
}) {
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
      {!withLayout ? (
        <div className="mx-auto w-full max-w-360 flex-1 px-5 py-8 sm:px-8 lg:px-10">
          {children ?? <Outlet />}
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-360 flex-1 grid-cols-1 gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-12">
          <aside
            aria-label="Society index"
            className="order-2 lg:order-1 lg:sticky lg:top-24 lg:self-start"
          >
            <SocietyIndex />
          </aside>
          <div className="order-1 min-w-0 lg:order-2">
            {children ?? <Outlet />}
          </div>
        </div>
      )}
    </div>
  );
}
