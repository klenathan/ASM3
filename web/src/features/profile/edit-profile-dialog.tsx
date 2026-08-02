import { useEffect, useState } from "react";

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
import type { UpdateProfileInput } from "./api";

export function EditProfileDialog({
  open,
  onOpenChange,
  initialDisplayName,
  initialBio,
  onSave,
  isSaving,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDisplayName: string
  initialBio: string | null
  onSave: (input: UpdateProfileInput) => void
  isSaving: boolean
  error: string | null
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [bio, setBio] = useState(initialBio ?? "")

  useEffect(() => {
    if (!open) return
    setDisplayName(initialDisplayName)
    setBio(initialBio ?? "")
  }, [open, initialDisplayName, initialBio])

  const trimmedName = displayName.trim()
  const invalid = trimmedName.length === 0

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
            if (invalid || isSaving) return
            onSave({ displayName: trimmedName, bio: bio.trim() === "" ? null : bio.trim() })
          }}
        >
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
              disabled={invalid || isSaving}
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
