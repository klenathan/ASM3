import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { useMediaUrl } from "../media/use-media-url";
import type { SocietyDiscoveryItem } from "./types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

function slugLabel(slug: string): string {
  return slug.toUpperCase().slice(0, 2);
}

interface SocietyCardProps {
  readonly society: SocietyDiscoveryItem;
}

export function SocietyCard({ society }: SocietyCardProps) {
  const isMember = society.membership?.status === "active";
  const avatarUrl = useMediaUrl(society.avatarMediaId);

  return (
    <Link
      to={`/s/${society.slug}`}
      className="group block border-t border-foreground/15 py-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Open ${society.name}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="mt-1 !size-12">
            {avatarUrl.data ? (
              <AvatarImage
                src={avatarUrl.data.url}
                alt={`${society.name} profile picture`}
                className="rounded-md"
              />
            ) : null}
            <AvatarFallback className="rounded-full">
              {slugLabel(society.slug)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-heading text-xl font-semibold tracking-[0.01em] text-foreground group-hover:text-primary sm:text-2xl">
                {society.name}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium tracking-[0.06em] uppercase",
                  isMember ? "text-primary" : "text-muted-foreground",
                )}
              >
                {isMember ? (
                  <>
                    <Check
                      aria-hidden="true"
                      className="size-3.5"
                      strokeWidth={2.5}
                    />
                    member
                  </>
                ) : (
                  <span aria-hidden="true" className="opacity-0 select-none">
                    ·
                  </span>
                )}
              </span>
              <span className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
                /{society.slug}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 max-w-2xl leading-7 text-muted-foreground">
              {society.description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <span className="hidden text-xs tracking-[0.06em] text-muted-foreground uppercase sm:inline">
            {formatDate(society.createdAt)}
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>
      </div>
    </Link>
  );
}
