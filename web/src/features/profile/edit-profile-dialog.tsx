import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { useMediaUrl } from "../media/use-media-url";
import type { UpdateProfileInput } from "./api";

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type AvatarChangeAction =
  | { type: "keep" }
  | { type: "remove" }
  | { type: "upload"; file: File };

export function EditProfileDialog({
  open,
  onOpenChange,
  initialDisplayName,
  initialBio,
  initialAvatarMediaId,
  onSave,
  isSaving,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDisplayName: string
  initialBio: string | null
  initialAvatarMediaId: string | null
  onSave: (input: UpdateProfileInput, avatar: AvatarChangeAction) => void
  isSaving: boolean
  error: string | null
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [bio, setBio] = useState(initialBio ?? "")
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const avatarInputId = useId()
  const avatarErrorId = `${avatarInputId}-error`
  const currentAvatar = useMediaUrl(initialAvatarMediaId)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (avatarFile === null) return null
    return URL.createObjectURL(avatarFile)
  }, [avatarFile])

  useEffect(() => {
    if (!open) return
    setDisplayName(initialDisplayName)
    setBio(initialBio ?? "")
    setAvatarFile(null)
    setAvatarRemoved(false)
    setAvatarError(null)
  }, [open, initialDisplayName, initialBio])

  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const trimmedName = displayName.trim()
  const invalid = trimmedName.length === 0

  function handleFileSelection(file: File | undefined) {
    setAvatarError(null)
    if (file === undefined) return
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError("Use a PNG, JPG, or WebP image for your avatar.")
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Your avatar must be 5 MB or smaller.")
      return
    }
    setAvatarFile(file)
    setAvatarRemoved(false)
  }

  const removed = avatarRemoved && avatarFile === null
  const avatarAction: AvatarChangeAction = avatarFile !== null
    ? { type: "upload", file: avatarFile }
    : removed
      ? { type: "remove" }
      : { type: "keep" }

  const previewSrc =
    avatarFile !== null
      ? previewUrl
      : removed
        ? undefined
        : currentAvatar.data?.url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>
            Keep it to what your table should know about you.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (invalid || isSaving || avatarError !== null) return
            onSave(
              { displayName: trimmedName, bio: bio.trim() === "" ? null : bio.trim() },
              avatarAction,
            )
          }}
        >
          <div className="flex flex-col gap-3">
            <Label>Avatar</Label>
              <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={previewSrc ?? undefined} alt="Your avatar" />
                <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
                  {trimmedName === "" ? "?" : trimmedName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-none border-foreground/20 px-3 text-sm shadow-none"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <ImagePlus aria-hidden="true" className="size-4" />
                    Upload
                  </Button>
                  {initialAvatarMediaId !== null && avatarFile === null && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-none px-3 text-sm text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setAvatarRemoved(true)
                        setAvatarError(null)
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or WebP up to 5 MB.
                </p>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              id={avatarInputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-describedby={avatarErrorId}
              onChange={(event) => {
                handleFileSelection(event.target.files?.[0])
                event.target.value = ""
              }}
            />
            {avatarError !== null && (
              <p id={avatarErrorId} role="alert" className="text-sm text-destructive">
                {avatarError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              value={bio}
              maxLength={500}
              rows={4}
              placeholder="A line about you, your course, or your corner of RMIT."
              onChange={(event) => setBio(event.target.value)}
            />
            <span className="text-right text-xs text-muted-foreground">
              {bio.length}/500
            </span>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-none border-foreground/20 shadow-none"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={invalid || isSaving || avatarError !== null}
              className="h-10 rounded-none px-4 font-semibold shadow-none"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
