import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { EntryPage } from "@/pages/entry-page";
import { FeedPage } from "@/pages/feed-page";
import { LoginPage } from "@/pages/login-page";
import { ModerationPage } from "@/pages/moderation-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { PostDetailPage } from "@/pages/post-detail-page";
import { ProfilePage } from "@/pages/profile-page";
import { ReportsAppealsPage } from "@/pages/reports-appeals-page";
import { SpacePage } from "@/pages/space-page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/post/:id" element={<PostDetailPage />} />
          <Route path="/space/:id" element={<SpacePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/u/:handle" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/reports" element={<ReportsAppealsPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
        </Route>
      </Route>
      <Route path="/dashboard" element={<Navigate to="/feed" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
