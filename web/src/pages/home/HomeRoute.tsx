import { ProtectedLayout } from "../../app/ProtectedLayout";
import { useAuth } from "../../features/auth/auth-context";
import { ForumPage } from "../forum/ForumPage";
import { LandingPage } from "../landing/LandingPage";
import { ForbiddenPage, LoadingPage, NetworkErrorPage } from "../status";

export function HomeRoute() {
  const { status, error } = useAuth();

  if (status === "loading")
    return <LoadingPage label="Checking your place at the table" />;
  if (status === "forbidden") return <ForbiddenPage detail={error?.message} />;
  if (error?.code === "NETWORK_ERROR") return <NetworkErrorPage />;
  if (status === "authenticated")
    return (
      <ProtectedLayout>
        <ForumPage />
      </ProtectedLayout>
    );
  return <LandingPage />;
}
