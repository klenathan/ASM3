import { Bell, ChevronDown, LogOut, Search, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/auth-context";
import { useMediaUrl } from "../../features/media/use-media-url";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { LogoMark } from "./LogoMark";

export function TopBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const currentAvatar = useMediaUrl(user?.avatarMediaId);
  const menuItems: {
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
  }[] = [
    { label: "Profile", icon: UserRound, onClick: () => navigate("/profile") },
    { label: "Settings", icon: Settings, onClick: () => navigate("/settings") },
  ];
  const initials = (user?.displayName ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/15 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-6 lg:px-10">
        <LogoMark />

        <form
          role="search"
          className="relative mx-auto w-full max-w-xl flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const query = String(form.get("q") ?? "").trim()
            navigate(`/societies${query === "" ? "" : `?q=${encodeURIComponent(query)}`}`)
          }}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            aria-label="Search societies"
            placeholder="Search societies"
            className="h-10 w-full rounded-full border-foreground/20 pl-9 pr-4"
          />
        </form>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="relative rounded-full"
          >
            <Bell aria-hidden="true" className="size-5" />
            <span
              aria-hidden="true"
              className="absolute top-2 right-2.5 size-2 rounded-full bg-signal"
            />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              asChild
              className="h-10 rounded-full px-2 text-base"
            >
              <Button variant="ghost">
                <Avatar className="size-8">
                  <AvatarImage
                    data-testid="topbar-avatar-image"
                    src={currentAvatar.data?.url}
                    alt="Your avatar"
                  />
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">
                  {user?.displayName}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="hidden size-4 text-muted-foreground sm:block"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {menuItems.map(({ label, icon: Icon, onClick }) => (
                <DropdownMenuItem
                  key={label}
                  onSelect={() => onClick?.()}
                >
                  <Icon aria-hidden="true" /> {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOut aria-hidden="true" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
