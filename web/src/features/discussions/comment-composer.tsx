import { Send } from "lucide-react"
import { useState } from "react"

import { Button } from "../../components/ui/button"
import { Textarea } from "../../components/ui/textarea"

export function CommentComposer({
  label,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: {
  readonly label: string
  readonly submitLabel: string
  readonly isSubmitting: boolean
  readonly error?: string
  readonly onSubmit: (body: string) => Promise<void>
  readonly onCancel?: () => void
}) {
  const [body, setBody] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      aria-label={label}
      className="border border-foreground/20 bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const value = body.trim()
        if (value === "") {
          setLocalError("Write a comment before posting.")
          return
        }
        setLocalError(null)
        void onSubmit(value).then(() => setBody("")).catch(() => undefined)
      }}
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write in Markdown. Use **bold**, lists, or links."
        className="min-h-28 rounded-none border-foreground/20 bg-background px-3 py-3 text-sm leading-6"
        disabled={isSubmitting}
      />
      {(localError ?? error) !== null && (localError ?? error) !== undefined && (
        <p role="alert" className="mt-2 text-sm text-destructive">{localError ?? error}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting} className="rounded-none">
          <Send aria-hidden="true" /> {isSubmitting ? "Posting" : submitLabel}
        </Button>
        {onCancel !== undefined && (
          <Button type="button" variant="ghost" className="rounded-none" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Markdown supported</span>
      </div>
    </form>
  )
}
