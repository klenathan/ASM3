import { type ReactNode } from "react";

import { useAuth } from "../features/auth/auth-context";
import { ForbiddenPage } from "../pages/status";

export function AdminGuard({ children }: { children?: ReactNode }) {
  const { status, user } = useAuth();

  if (status !== "authenticated") return null;

  if (user?.platformRole !== "system_admin") return <ForbiddenPage />;

  return <>{children}</>;
}
