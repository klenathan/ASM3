import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedLayout } from "./ProtectedLayout";
import { HomeRoute } from "../pages/home/HomeRoute";
import { RegisterPage } from "../pages/register/RegisterPage";
import { SignInPage } from "../pages/sign-in/SignInPage";
import { ForumPage } from "../pages/forum/ForumPage";
import { BrowseSocietiesPage } from "../pages/societies/BrowseSocietiesPage";
import { SocietyDetailPage } from "../pages/societies/SocietyDetailPage";
import { ForbiddenPage, UnauthorizedPage } from "../pages/status";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />}>
        <Route element={<ProtectedLayout />}>
          <Route index element={<ForumPage />} />
          <Route path="societies" element={<BrowseSocietiesPage />} />
          <Route path="s/:slug" element={<SocietyDetailPage />} />
        </Route>
      </Route>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/401" element={<UnauthorizedPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
