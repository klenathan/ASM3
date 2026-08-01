import { Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/app-layout";

import { DashboardPage } from "@/pages/dashboard-page";

import { NotFoundPage } from "@/pages/not-found-page";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
