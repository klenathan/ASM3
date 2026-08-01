import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,oklch(0.96_0.04_155),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_left,oklch(0.25_0.04_155),transparent_35%)]">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}
