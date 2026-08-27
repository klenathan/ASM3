import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { Input } from "../../components/ui/input";
import { retrievePlace, searchPlaces } from "./api";
import type { PickedLocation, } from "./types";
import type { PlaceSuggestion } from "./api";

interface Props {
  readonly onPick: (loc: PickedLocation) => void;
  readonly onClear?: () => void;
  readonly picked: PickedLocation | null;
  readonly disabled?: boolean;
}

function newSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function LocationSearchInput({ onPick, onClear, picked, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [proximity, setProximity] = useState<string | null>("144.9631,-37.8136");
  const [errorBanner, setErrorBanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setProximity(`${pos.coords.longitude},${pos.coords.latitude}`),
        () => {},
        { timeout: 3000 },
      );
    }
  }, []);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setIsFetching(true);
    searchPlaces(debounced, proximity, sessionToken)
      .then((res) => {
        if (!cancelled) setSuggestions(res.suggestions);
      })
      .catch(() => {
        if (!cancelled) setErrorBanner(true);
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, proximity, sessionToken]);

  const hasQuery = debounced.trim().length >= 2;

  async function handlePick(mapboxId: string) {
    try {
      const details = await retrievePlace(mapboxId, sessionToken);
      onPick({
        mapboxId: details.mapboxId,
        name: details.name,
        placeType: details.placeType,
        latitude: details.latitude,
        longitude: details.longitude,
        address: details.address,
      });
      setQuery("");
      setDebounced("");
    } catch {
      setErrorBanner(true);
    }
  }

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-none border border-foreground/15 bg-muted px-3 py-2 text-sm">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{picked.name}</span>
        <button type="button" aria-label="Remove location" className="rounded p-1 hover:bg-background" onClick={onClear} disabled={disabled}>
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errorBanner && (
        <p role="alert" className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Search unavailable — post without location or retry.{" "}
          <button type="button" className="underline" onClick={() => setErrorBanner(false)}>
            Dismiss
          </button>
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (!sessionToken) setSessionToken(newSessionToken());
          }}
          placeholder="Add location — search RMIT campuses, buildings or venues"
          disabled={disabled}
          className="h-11 w-full rounded-none border-foreground/15 bg-background pl-10"
          aria-label="Search location"
        />
      </div>
      {hasQuery && (
        <div className="max-h-56 overflow-auto border border-foreground/15 bg-background">
          {isFetching && <p className="px-3 py-3 text-xs text-muted-foreground">Searching…</p>}
          {!isFetching && suggestions.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No places found.</p>}
          {suggestions.map((s) => (
            <button
              key={s.mapboxId}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => void handlePick(s.mapboxId)}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                {s.address && <span className="block truncate text-xs text-muted-foreground">{s.address}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
