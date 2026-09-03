import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { AdminGuard } from "./AdminGuard";
import { ProtectedLayout } from "./ProtectedLayout";
import { HomeRoute } from "../pages/home/HomeRoute";
import { AdminPage } from "../pages/admin/AdminPage";
import { RegisterPage } from "../pages/register/RegisterPage";
import { SignInPage } from "../pages/sign-in/SignInPage";
import { ForumPage } from "../pages/forum/ForumPage";
import { BrowseSocietiesPage } from "../pages/societies/BrowseSocietiesPage";
import { SocietyDetailPage } from "../pages/societies/SocietyDetailPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { UserProfilePage } from "../pages/u/UserProfilePage";
import { ForbiddenPage, UnauthorizedPage } from "../pages/status";
import { ThreadPage } from "../pages/thread/ThreadPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />}>
        <Route
          path="admin"
          element={
            <ProtectedLayout withLayout={false}>
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            </ProtectedLayout>
          }
        />

        <Route element={<ProtectedLayout />}>
          <Route index element={<ForumPage />} />
          <Route path="societies" element={<BrowseSocietiesPage />} />
          <Route path="s/:slug" element={<SocietyDetailPage />} />
          <Route path="s/:slug/t/:id" element={<ThreadPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />

          <Route path="u/:sid" element={<UserProfilePage />} />
        </Route>
      </Route>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/society/:slug/thread/:id" element={<ThreadRedirect />} />
      <Route path="/401" element={<UnauthorizedPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ThreadRedirect() {
  const { slug, id } = useParams();
  return <Navigate to={`/s/${slug ?? ""}/t/${id ?? ""}`} replace />;
}
