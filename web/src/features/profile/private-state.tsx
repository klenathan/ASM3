import { Lock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Link } from "react-router-dom";

export function PrivateProfileState({ displayName }: { displayName: string }) {
  return (
    <section aria-labelledby="private-title" className="mt-14 border-t-2 border-foreground pt-10">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center bg-foreground text-background"
        >
          <Lock size={22} strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h2 id="private-title" className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
            This profile is private.
          </h2>
          <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
            {displayName} keeps their profile and activity to themselves. Their threads and
            comments aren’t shown here.
          </p>
          <Button
            type="button"
            variant="paper-outline"
            className="mt-6"
            asChild
          >
            <Link to="/">Back to the forum</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
