import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-4xl tracking-tight font-black sm:text-5xl">
        Page not found
      </h1>
      <p className="max-w-md text-muted-foreground">
        This corner of the common room doesn’t exist — or it’s only open to
        members. Head back to the feed to keep the conversation going.
      </p>
      <Button asChild>
        <Link to="/feed">Back to the common room</Link>
      </Button>
    </div>
  );
}
