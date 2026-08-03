import { useEffect, useState } from "react";
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

export function ThreadMedia({
  mediaIds,
  className,
  size = "md",
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

  // Multiple images render in a carousel; a single image renders directly.
  const carousel = (
    <Carousel
      className={cn("group/carousel", className)}
      opts={{ align: "start" }}
    >
      <CarouselContent>
        {mediaIds.map((id, index) => {
          const match = urls.find((media) => media.mediaId === id);
          return (
            <CarouselItem key={id} className="w-full">
              <ThreadImage
                url={match?.url}
                loading={pending}
                index={index}
                size={size}
                onClick={() => openLightbox(index)}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );

  const single = (() => {
    const match = urls.find((media) => media.mediaId === mediaIds[0]);
    return (
      <ThreadImage
        url={match?.url}
        loading={pending}
        index={0}
        size={size}
        onClick={() => openLightbox(0)}
      />
    );
  })();

  return (
    <>
      {mediaIds.length > 1 ? carousel : single}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogOverlay className="bg-black/80" />
        <DialogContent
          showCloseButton={false}
          className="max-w-none gap-0 overflow-hidden rounded-none border-0 bg-black p-0 ring-0 sm:max-w-none"
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

function ThreadImage({
  url,
  loading,
  index,
  size = "md",
  className,
  onClick,
}: {
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly index: number;
  readonly size: "sm" | "md" | "lg";
  readonly className?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={url ? "done" : loading ? "processing" : "error"}
      className={cn(
        "relative flex cursor-zoom-in items-center justify-center overflow-hidden rounded-sm border border-foreground/20 bg-muted text-muted-foreground transition-transform hover:brightness-95 [&_svg]:size-5",
        size === "sm" ? "size-16" : size === "md" ? "size-64" : "w-full",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Image ${index + 1} attached to this thread`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : loading ? (
        <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
      ) : (
        <ImageIcon aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
