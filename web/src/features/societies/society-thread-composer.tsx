import { ImagePlus, LockKeyhole, PenLine, Send, Trash2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Textarea } from "../../components/ui/textarea";
import { LocationPreview } from "../location/location-preview";
import { LocationSearchInput } from "../location/location-search-input";
import type { PickedLocation } from "../location/types";
import type { CreateThreadDraft } from "./types";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 20;

export type ThreadPostingAccess = "loading" | "member" | "guest" | "banned";

interface SocietyThreadComposerProps {
  readonly societyName: string;
  readonly displayName: string;
  readonly access: ThreadPostingAccess;
  readonly isSubmitting: boolean;
  readonly serverError?: string;
  readonly onCreate: (input: CreateThreadDraft) => Promise<void>;
}

interface ComposerErrors {
  readonly title?: string;
  readonly body?: string;
  readonly images?: string;
}

export function SocietyThreadComposer({
  societyName,
  displayName,
  access,
  isSubmitting,
  serverError,
  onCreate,
}: SocietyThreadComposerProps) {
  const titleId = useId();
  const bodyId = useId();
  const imagesId = useId();
  const titleErrorId = `${titleId}-error`;
  const bodyErrorId = `${bodyId}-error`;
  const imagesErrorId = `${imagesId}-error`;
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const previews = useImagePreviews(images);
  const [errors, setErrors] = useState<ComposerErrors>({});
  const [published, setPublished] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string>();
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);

  if (access === "loading") {
    return (
      <div
        aria-label="Checking posting access"
        className="border-y border-foreground/15 py-5"
      >
        <Skeleton className="h-12 w-full rounded-none" />
      </div>
    );
  }

  if (access !== "member") {
    const isBanned = access === "banned";
    return (
      <aside
        aria-label="Posting access"
        className="flex items-start gap-4 border-y border-foreground/15 bg-card px-4 py-5 sm:px-5"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center bg-foreground text-background"
        >
          <LockKeyhole className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="font-heading text-lg leading-6 font-semibold uppercase">
            {isBanned ? "Posting unavailable" : `Join ${societyName} to post`}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isBanned
              ? "Your society membership does not currently allow new threads."
              : "Only active society members can start threads and join the discussion."}
          </p>
        </div>
      </aside>
    );
  }

  function closeComposer() {
    setIsOpen(false);
    setErrors({});
    setUnexpectedError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: ComposerErrors = {
      ...(title.trim() === "" ? { title: "Add a clear thread title." } : {}),
      ...(body.trim() === ""
        ? { body: "Write something for the society." }
        : {}),
    };
    setErrors(nextErrors);
    setUnexpectedError(undefined);

    if (nextErrors.title !== undefined) {
      titleRef.current?.focus();
      return;
    }
    if (nextErrors.body !== undefined) {
      bodyRef.current?.focus();
      return;
    }

    try {
      await onCreate({
        title: title.trim(),
        body: body.trim(),
        images,
        ...(pickedLocation ? { location: { mapboxId: pickedLocation.mapboxId, name: pickedLocation.name, latitude: pickedLocation.latitude, longitude: pickedLocation.longitude, placeType: pickedLocation.placeType, address: pickedLocation.address } } : {}),
      });
      setTitle("");
      setBody("");
      setImages([]);
      setPickedLocation(null);
      setErrors({});
      setIsOpen(false);
      setPublished(true);
    } catch {
      setUnexpectedError(
        "Your thread was not published. Review it and try again.",
      );
    }
  }

  function addImages(selectedFiles: FileList | null) {
    if (selectedFiles === null) return;
    const selected = Array.from(selectedFiles);
    const existingKeys = new Set(images.map(fileKey));
    const accepted: File[] = [];
    let imageError: string | undefined;

    for (const file of selected) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        imageError = "Choose JPG, PNG, GIF, or WebP images only.";
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        imageError = `${file.name} is larger than 10 MB.`;
        continue;
      }
      if (existingKeys.has(fileKey(file))) continue;
      if (images.length + accepted.length >= MAX_IMAGES) {
        imageError = `A thread can include up to ${MAX_IMAGES} images.`;
        break;
      }
      existingKeys.add(fileKey(file));
      accepted.push(file);
    }

    if (accepted.length > 0) setImages((current) => [...current, ...accepted]);
    setErrors((current) => ({ ...current, images: imageError }));
    if (imageInputRef.current !== null) imageInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setErrors((current) => ({ ...current, images: undefined }));
  }

  if (!isOpen) {
    return (
      <div className="border-y border-foreground/15 bg-card px-4 py-4 sm:px-5">
        <button
          type="button"
          className="group flex min-h-12 w-full items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => {
            setPublished(false);
            setIsOpen(true);
            window.requestAnimationFrame(() => titleRef.current?.focus());
          }}
        >
          <span className="hidden items-center gap-2 text-sm font-semibold text-secondary sm:inline-flex bg-primary p-2">
            <PenLine aria-hidden="true" className="size-4" /> New thread
          </span>

          <span className="min-w-0 flex-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
            Start a thread in {societyName}
          </span>
        </button>
        {published && (
          <p
            role="status"
            className="mt-3 border-t border-foreground/10 pt-3 text-sm font-medium text-primary"
          >
            Thread published. It is now first in the society feed.
          </p>
        )}
      </div>
    );
  }

  const submissionError = serverError ?? unexpectedError;

  return (
    <form
      aria-labelledby="thread-composer-title"
      className="border-y-2 border-foreground bg-card"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex items-start justify-between gap-4 border-b border-foreground/15 px-4 py-4 sm:px-5">
        <div>
          <h2
            id="thread-composer-title"
            className="font-heading text-xl font-semibold uppercase"
          >
            Start a thread
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Posting to {societyName} as {displayName}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 rounded-none"
          aria-label="Close thread composer"
          disabled={isSubmitting}
          onClick={closeComposer}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-5">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={titleId} className="text-sm font-semibold">
              Thread title
            </label>
            <span className="text-xs text-muted-foreground">
              {title.length}/300
            </span>
          </div>
          <Input
            ref={titleRef}
            id={titleId}
            value={title}
            maxLength={300}
            disabled={isSubmitting}
            aria-invalid={errors.title !== undefined}
            aria-describedby={
              errors.title === undefined ? undefined : titleErrorId
            }
            className="mt-2 h-12 rounded-none border-foreground/20 bg-background px-3 text-base"
            placeholder="What should members know?"
            onChange={(event) => {
              setTitle(event.target.value);
              if (errors.title !== undefined)
                setErrors((current) => ({ ...current, title: undefined }));
            }}
          />
          {errors.title && (
            <p id={titleErrorId} className="mt-2 text-sm text-destructive">
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={bodyId} className="text-sm font-semibold">
            Your post
          </label>
          <Textarea
            ref={bodyRef}
            id={bodyId}
            value={body}
            maxLength={100_000}
            rows={6}
            disabled={isSubmitting}
            aria-invalid={errors.body !== undefined}
            aria-describedby={
              errors.body === undefined ? undefined : bodyErrorId
            }
            className="mt-2 min-h-36 resize-y rounded-none border-foreground/20 bg-background px-3 py-3 text-base leading-7"
            placeholder="Add context, ask a question, or share an update…"
            onChange={(event) => {
              setBody(event.target.value);
              if (errors.body !== undefined)
                setErrors((current) => ({ ...current, body: undefined }));
            }}
          />
          {errors.body && (
            <p id={bodyErrorId} className="mt-2 text-sm text-destructive">
              {errors.body}
            </p>
          )}
        </div>

        <div className="border-t border-foreground/15 pt-5">
          <p className="text-sm font-semibold">Location (optional)</p>
          <p className="mt-1 text-xs text-muted-foreground">Add a verified place. Search Mapbox, pick one, drag pin to fine-tune.</p>
          <div className="mt-3">
            <LocationSearchInput picked={pickedLocation} onPick={setPickedLocation} onClear={() => setPickedLocation(null)} disabled={isSubmitting} />
          </div>
          {pickedLocation && (
            <div className="mt-3">
              <LocationPreview location={pickedLocation} onUpdate={setPickedLocation} />
            </div>
          )}
        </div>

        <div className="border-t border-foreground/15 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Images</p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG, GIF, or WebP · 10 MB each
              </p>
            </div>
            <input
              ref={imageInputRef}
              id={imagesId}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="sr-only"
              disabled={isSubmitting || images.length >= MAX_IMAGES}
              aria-label="Choose thread images"
              aria-describedby={
                errors.images === undefined ? undefined : imagesErrorId
              }
              onChange={(event) => addImages(event.currentTarget.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-none shadow-none"
              disabled={isSubmitting || images.length >= MAX_IMAGES}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              Add images
            </Button>
          </div>

          {previews.length > 0 && (
            <ul
              aria-label="Selected images"
              className="mt-4 grid gap-2 sm:grid-cols-2"
            >
              {previews.map(({ file, url }, index) => (
                <li
                  key={fileKey(file)}
                  className="flex min-w-0 items-center gap-3 border border-foreground/15 bg-background p-2"
                >
                  <div className="size-14 shrink-0 overflow-hidden bg-muted">
                    {url === null ? (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <ImagePlus aria-hidden="true" className="size-5" />
                      </span>
                    ) : (
                      <img
                        src={url}
                        alt={`Preview of ${file.name}`}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-none"
                    disabled={isSubmitting}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeImage(index)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {errors.images && (
            <p
              id={imagesErrorId}
              role="alert"
              className="mt-3 text-sm text-destructive"
            >
              {errors.images}
            </p>
          )}
        </div>

        {submissionError && (
          <p
            role="alert"
            className="border-t border-destructive/30 pt-4 text-sm text-destructive"
          >
            {submissionError}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-foreground/15 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-none px-4"
          disabled={isSubmitting}
          onClick={closeComposer}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="h-11 rounded-none px-5 font-semibold shadow-none"
          disabled={isSubmitting}
        >
          <Send aria-hidden="true" />
          {isSubmitting
            ? images.length > 0
              ? "Uploading & publishing…"
              : "Publishing…"
            : "Publish thread"}
        </Button>
      </div>
    </form>
  );
}

function useImagePreviews(images: readonly File[]) {
  const previews = useMemo(
    () =>
      images.map((file) => ({
        file,
        url:
          typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : null,
      })),
    [images],
  );

  useEffect(
    () => () => {
      for (const preview of previews) {
        if (preview.url !== null) URL.revokeObjectURL(preview.url);
      }
    },
    [previews],
  );

  return previews;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatFileSize(byteSize: number): string {
  if (byteSize < 1024 * 1024)
    return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

// function initials(displayName: string): string {
//   return (
//     displayName
//       .split(/\s+/)
//       .filter(Boolean)
//       .map((part) => part[0])
//       .slice(0, 2)
//       .join("")
//       .toUpperCase() || "?"
//   );
// }
