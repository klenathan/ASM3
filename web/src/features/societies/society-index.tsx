import { RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useMediaUrl } from "../media/use-media-url";
import { useMySocieties } from "./use-society";
import type { MySociety } from "./types";

function slugLabel(slug: string): string {
  return slug.toUpperCase().slice(0, 2);
}

function SocietyRow({ society }: { readonly society: MySociety }) {
  const avatarUrl = useMediaUrl(society.avatarMediaId);
  const isModerator = society.membership.role === "moderator";

  return (
    <li className="shrink-0 lg:shrink">
      <Link
        to={`/s/${society.slug}`}
        className="group flex min-w-44 items-center gap-3 border border-foreground/15 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-w-0 lg:border-0 lg:px-0 lg:py-2 lg:hover:bg-transparent"
        aria-label={`Open ${society.name}`}
      >
        <Avatar className="!size-8 shrink-0">
          {avatarUrl.data ? (
            <AvatarImage
              src={avatarUrl.data.url}
              alt={`${society.name} profile picture`}
            />
          ) : null}
          <AvatarFallback className="text-xs">
            {slugLabel(society.slug)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm leading-6 group-hover:text-primary">
          {society.name}
        </span>
        {isModerator ? (
          <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            mod
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function SocietyIndex() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMySocieties();

  return (
    <div className="lg:pt-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
          Your index
        </h2>
        {data && data.length > 0 ? (
          <span className="text-xs text-muted-foreground lg:hidden">
            Swipe to browse
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div aria-label="Loading your societies" className="mt-4 space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-12 w-full lg:h-8" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="mt-4">
          <p className="text-sm leading-6 text-muted-foreground">
            We couldn't load your societies. Please try again.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            className="mt-4 h-9 px-3 text-sm"
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1">
          {data.map((society) => (
            <SocietyRow key={society.id} society={society} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          Your society shelf is waiting for its first entry.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => navigate("/societies")}
        className="mt-5 h-11 w-full justify-start rounded-none border-foreground/20 px-3 shadow-none sm:w-auto lg:w-full"
      >
        <span aria-hidden="true" className="text-primary">
          +
        </span>{" "}
        Discover societies
      </Button>
    </div>
  );
}
