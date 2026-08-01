import {
  Bell,
  Flag,
  Home,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import { useSocieties } from "@/lib/api/queries";
import { toMember, toSpace } from "@/lib/model";

import { MemberAvatar, RoleBadge } from "./member-bits";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const NAV = [
  { to: "/feed", label: "Home", icon: Home },
  { to: "/moderation", label: "Review", icon: ShieldCheck },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/reports", label: "Reports", icon: Flag },
];

export function AppShell() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const dark = resolvedTheme === "dark";
  const { data: societies } = useSocieties();

  const member = user ? toMember(user) : undefined;
  const joined = (societies ?? []).map(toSpace);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-4">
          <Link
            to="/feed"
            className="flex items-center gap-2 font-display text-lg font-black tracking-tight"
          >
            <span
              className="flex size-8 items-center justify-center rounded-md text-white"
              style={{ background: "var(--stamp)" }}
            >
              R
            </span>
            <span className="hidden sm:inline">commonroom</span>
          </Link>

          <nav className="ml-3 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground"
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search"
                placeholder="Search"
                className="h-8 w-40 rounded-md border border-border bg-background pl-8 pr-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="text-muted-foreground md:hidden"
            >
              <Link to="/notifications">
                <Bell className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle dark mode"
              onClick={() => setTheme(dark ? "light" : "dark")}
              className="text-muted-foreground"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {member && (
              <Link
                to="/profile"
                className="ml-1 flex items-center gap-2 rounded-md py-1 pr-2 pl-1 hover:bg-muted"
              >
                <MemberAvatar member={member} size="sm" />
                <span className="hidden text-xs font-semibold lg:inline">
                  {member.name.split(" ")[0]}
                </span>
                <RoleBadge role={member.role} />
              </Link>
            )}
            {!member && (
              <Button asChild variant="ghost" size="icon" aria-label="Profile">
                <Link to="/profile">
                  <UserRound className="size-4" />
                </Link>
              </Button>
            )}
            {member && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={signOut}
                className="text-muted-foreground"
              >
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-1 gap-6 px-3 py-6 sm:px-4">
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="mb-4 flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground"
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <h2 className="mb-2 flex items-center justify-between px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Spaces</span>
            <span className="tabular-nums">discover</span>
          </h2>
          <ul className="space-y-0.5">
            {joined.map((s) => (
              <li key={s.id}>
                <NavLink
                  to={`/space/${s.slug}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                      isActive && "bg-muted"
                    )
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ background: `oklch(0.55 0.15 ${s.hue})` }}
                  />
                  <span className="truncate">{s.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
