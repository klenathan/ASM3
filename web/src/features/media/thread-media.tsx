import { useEffect, useState, type ReactNode } from "react";
import { Image as ImageIcon, RefreshCw, XIcon } from "lucide-react";

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../../components/ui/carousel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
} from "../../components/ui/dialog";
import { cn } from "../../lib/utils";
import { useMediaUrls } from "./use-media-url";
import type { MediaUrl } from "./api";

export function ThreadMedia({
  mediaIds,
  className,
}: {
  readonly mediaIds: readonly string[];
  readonly className?: string;
  readonly size?: "sm" | "md" | "lg";
}) {
  const { urls, pending } = useMediaUrls(mediaIds);
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  // Reset the preview scroll when the dialog is reopened.
  const [lightboxApi, setLightboxApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  // Scroll the lightbox to the clicked image and track the active slide.
  useEffect(() => {
    if (!lightboxApi) return;
    const sync = () => setActiveIndex(lightboxApi.selectedScrollSnap());
    sync();
    lightboxApi.on("select", sync);
    lightboxApi.on("reInit", sync);
    if (open) {
      lightboxApi.scrollTo(startIndex, true);
    }
    return () => {
      lightboxApi.off("select", sync);
      lightboxApi.off("reInit", sync);
    };
  }, [open, startIndex, lightboxApi]);

  if (mediaIds.length === 0) return null;

  const openLightbox = (index: number) => {
    setStartIndex(index);
    setActiveIndex(index);
    setOpen(true);
  };

  return (
    <>
      <MediaGrid
        mediaIds={mediaIds}
        urls={urls}
        pending={pending}
        onOpen={openLightbox}
        className={className}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogOverlay className="bg-black/80" />
        <DialogContent
          showCloseButton={false}
          className="max-w-none h-full gap-0 overflow-hidden rounded-none border-0 bg-black/10 p-0 ring-0 sm:max-w-none"
        >
          <div className="relative flex size-full min-h-[80vh] items-center justify-center">
            <Carousel setApi={setLightboxApi} className="w-full">
              <CarouselContent className="-ml-0">
                {mediaIds.map((id, index) => {
                  const match = urls.find((media) => media.mediaId === id);
                  return (
                    <CarouselItem
                      key={id}
                      className="flex h-[80vh] items-center justify-center pl-0"
                    >
                      {match?.url ? (
                        <img
                          src={match.url}
                          alt={`Image ${index + 1} attached to this thread`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="flex size-24 items-center justify-center text-white/70">
                          {pending ? (
                            <RefreshCw
                              aria-hidden="true"
                              className="size-8 animate-spin"
                            />
                          ) : (
                            <ImageIcon aria-hidden="true" className="size-8" />
                          )}
                        </div>
                      )}
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              {mediaIds.length > 1 && (
                <>
                  <CarouselPrevious
                    variant="ghost"
                    className="-left-2 text-white hover:bg-white/10 hover:text-white"
                  />
                  <CarouselNext
                    variant="ghost"
                    className="-right-2 text-white hover:bg-white/10 hover:text-white"
                  />
                </>
              )}
            </Carousel>

            {mediaIds.length > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
                {activeIndex + 1} / {mediaIds.length}
              </div>
            )}
          </div>

          <DialogClose asChild>
            <button
              type="button"
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              aria-label="Close"
            >
              <XIcon className="size-5" />
            </button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Facebook-style responsive preview grid. Renders up to four tiles in the
 * card; when more than four media exist the fourth tile becomes an overflow
 * tile showing a remaining item behind a '+N' count overlay.
 */
function MediaGrid({
  mediaIds,
  urls,
  pending,
  onOpen,
  className,
}: {
  readonly mediaIds: readonly string[];
  readonly urls: readonly MediaUrl[];
  readonly pending: boolean;
  readonly onOpen: (index: number) => void;
  readonly className?: string;
}) {
  const count = mediaIds.length;
  const overflow = count > 4 ? count - 4 : 0;
  // Build up to four tiles. The final tile doubles as the overflow tile when
  // more than four media exist, showing a remaining (5th onward) item behind a
  // '+N' overlay so the tile is never empty.
  const tiles: { mediaIndex: number; overflow: boolean }[] = [];
  for (let i = 0; i < Math.min(count, 3); i++) {
    tiles.push({ mediaIndex: i, overflow: false });
  }
  if (count >= 4) {
    tiles.push({ mediaIndex: overflow > 0 ? 4 : 3, overflow: overflow > 0 });
  }

  const layout = gridLayout(tiles.length);

  return (
    <div className={cn(layout.container, className)}>
      {tiles.map(({ mediaIndex, overflow }) => {
        const id = mediaIds[mediaIndex];
        const match = urls.find((media) => media.mediaId === id);
        return (
          <GridTile
            key={`${id}-${mediaIndex}`}
            url={match?.url}
            loading={pending}
            index={mediaIndex}
            aspect={layout.tile(mediaIndex)}
            onClick={() => onOpen(mediaIndex)}
          >
            {overflow ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">
                +{overflow}
              </span>
            ) : undefined}
          </GridTile>
        );
      })}
    </div>
  );
}

function gridLayout(count: number) {
  if (count === 1) {
    return {
      container: "grid grid-cols-1 gap-[2px]",
      tile: () => "aspect-[16/10]",
    };
  }
  if (count === 2) {
    return {
      container: "grid grid-cols-2 gap-[2px]",
      tile: () => "aspect-square",
    };
  }
  if (count === 3) {
    return {
      container: "grid grid-cols-3 grid-rows-2 gap-[2px]",
      tile: (index: number) =>
        index === 0 ? "col-span-2 row-span-2 h-full" : "aspect-square",
    };
  }
  return {
    container: "grid grid-cols-2 grid-rows-2 gap-[2px]",
    tile: () => "aspect-square",
  };
}

function GridTile({
  url,
  loading,
  index,
  aspect,
  onClick,
  children,
}: {
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly index: number;
  readonly aspect: string;
  readonly onClick: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-state={url ? "done" : loading ? "processing" : "error"}
      className={cn(
        "relative flex cursor-zoom-in items-center justify-center overflow-hidden rounded-[6px] border border-foreground/20 bg-muted text-muted-foreground transition-transform hover:brightness-95 [&_svg]:size-5",
        aspect,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Image ${index + 1} attached to this thread`}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : loading ? (
        <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
      ) : (
        <ImageIcon aria-hidden="true" className="size-5" />
      )}
      {children}
    </button>
  );
}
