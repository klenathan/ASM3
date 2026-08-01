import { Bell, MessageCircle, UserPlus, ShieldAlert, AlertTriangle, Megaphone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMarkNotificationRead, useNotifications } from "@/lib/api/queries";
import type { NotificationType } from "@/lib/api/types";
import { timeAgo } from "@/lib/model";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const VISIBLE_TYPES: Record<NotificationType, { label: string; icon: typeof MessageCircle }> = {
  REPLY: { label: "New reply", icon: MessageCircle },
  FOLLOW: { label: "New follower", icon: UserPlus },
  MODERATION: { label: "Moderation update", icon: ShieldAlert },
  APPEAL: { label: "Appeal update", icon: AlertTriangle },
  ANNOUNCEMENT: { label: "Announcement", icon: Megaphone },
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const items = (notifications.data ?? []).filter((n) =>
    filter === "ALL" ? true : !n.read
  );
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-black tracking-tight">
            <Bell className="size-6 text-stamp" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Replies, follows and moderation updates — never for content still
            in review.
          </p>
        </div>
        {unread > 0 && (
          <span className="rounded border border-stamp/40 bg-stamp/10 px-2 py-1 font-display text-xs font-black tracking-widest text-stamp">
            {unread} UNREAD
          </span>
        )}
      </header>

      <div className="flex gap-2">
        {(["ALL", "UNREAD"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
              filter === f
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f === "ALL" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      {notifications.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Spinner className="size-5" />
          <span className="text-sm">Loading notifications…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
          <p className="font-display text-2xl font-black tracking-tight">
            All quiet
          </p>
          <p className="mt-1 text-sm">
            Nothing here right now. Updates land when something happens on your
            card.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            const meta = VISIBLE_TYPES[n.type] ?? {
              label: "Update",
              icon: Bell,
            };
            const Icon = meta.icon;
            return (
              <li
                key={n.notification_id}
                className={cn(
                  "flex items-start gap-3 rounded-md border border-border bg-card p-4",
                  !n.read && "border-accent/40 bg-accent/5"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                    n.read ? "bg-muted text-muted-foreground" : "bg-accent/20 text-accent-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{meta.label}</p>
                  {n.content_id && (
                    <button
                      className="mt-0.5 text-xs text-stamp hover:underline"
                      onClick={() => navigate(`/post/${n.content_id}`)}
                    >
                      View the post
                    </button>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markRead.mutate(n.notification_id)}
                  >
                    Mark read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
