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
    <li>
      <Link
        to={`/s/${society.slug}`}
        className="group flex items-center gap-3 rounded-none py-2 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Open ${society.name}`}
      >
        <Avatar className="!size-8 shrink-0 rounded-md">
          {avatarUrl.data ? (
            <AvatarImage
              src={avatarUrl.data.url}
              alt={`${society.name} profile picture`}
              className="rounded-md"
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
          <span className="text-[0.65rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
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
      <h2 className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
        Your index
      </h2>

      {isLoading ? (
        <div aria-label="Loading your societies" className="mt-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
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
        <ul className="mt-4">
          {data.map((society) => (
            <SocietyRow key={society.id} society={society} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your society shelf is waiting for its first entry.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => navigate("/societies")}
        className="mt-5 h-11 w-full justify-start rounded-none border-foreground/20 px-3 shadow-none"
      >
        <span aria-hidden="true" className="text-primary">
          +
        </span>{" "}
        Discover societies
      </Button>
    </div>
  );
}
