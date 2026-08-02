import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedLayout } from "./ProtectedLayout";
import { ForumPage } from "../pages/forum/ForumPage";
import { HomeRoute } from "../pages/home/HomeRoute";
import { SignInPage } from "../pages/sign-in/SignInPage";
import { ForbiddenPage, UnauthorizedPage } from "../pages/status";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/401" element={<UnauthorizedPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/forum" element={<ForumPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
