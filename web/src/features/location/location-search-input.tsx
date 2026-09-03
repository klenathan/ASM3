import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { Input } from "../../components/ui/input";
import { retrievePlace, searchPlaces } from "./api";
import type { PickedLocation } from "./types";
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  function handleRequestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoNotice("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    setGeoNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProximity(`${pos.coords.longitude},${pos.coords.latitude}`);
        setIsLocating(false);
        setGeoNotice("Nearby location bias active");
      },
      () => {
        setIsLocating(false);
        setGeoNotice("Location permission denied or unavailable");
      },
      { timeout: 5000 },
    );
  }
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
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
        if (!cancelled) setErrorBanner("Search unavailable — post without location or retry.");
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, proximity, sessionToken, retryCount]);

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
      setSessionToken(null);
      setErrorBanner(null);
    } catch {
      setErrorBanner("Could not retrieve place details — please retry or select another place.");
    }
  }

  function handleClear() {
    setSessionToken(null);
    setErrorBanner(null);
    onClear?.();
  }

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-none border border-foreground/15 bg-muted px-3 py-2 text-sm">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{picked.name}</span>
        <button type="button" aria-label="Remove location" className="rounded p-1 hover:bg-background" onClick={handleClear} disabled={disabled}>
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errorBanner && (
        <div role="alert" className="flex items-center justify-between gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>{errorBanner}</span>
          <span className="flex shrink-0 gap-2">
            {debounced.trim().length >= 2 && (
              <button
                type="button"
                className="font-medium underline hover:no-underline"
                onClick={() => {
                  setErrorBanner(null);
                  setRetryCount((c) => c + 1);
                }}
              >
                Retry
              </button>
            )}
            <button type="button" className="underline hover:no-underline" onClick={() => setErrorBanner(null)}>
              Dismiss
            </button>
          </span>
        </div>
      )}
      <div className="relative flex items-center">
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
          className="h-11 w-full rounded-none border-foreground/15 bg-background pl-10 pr-10"
          aria-label="Search location"
        />
        <button
          type="button"
          onClick={handleRequestLocation}
          disabled={disabled || isLocating}
          aria-label="Use current location"
          title="Use current location for nearby suggestions"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <LocateFixed className={`size-4 ${isLocating ? "animate-spin text-primary" : ""}`} />
        </button>
      </div>
      {geoNotice && <p className="text-xs text-muted-foreground">{geoNotice}</p>}
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
