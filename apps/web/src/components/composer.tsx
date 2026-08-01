import { ImagePlus, Send, Sparkles } from "lucide-react";
import { useState } from "react";

import type { SpaceView } from "@/lib/model";
import { cn } from "@/lib/utils";

import { MemberAvatar } from "./member-bits";
import { Button } from "./ui/button";
import type { Member } from "@/lib/model";

export function Composer({
  spaces,
  currentMember,
  defaultSpaceId,
  onPost,
  pending = false,
}: {
  spaces: SpaceView[];
  currentMember: Member;
  defaultSpaceId?: string;
  onPost: (body: string, spaceId: string) => void;
  pending?: boolean;
}) {
  const [body, setBody] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id);
  const [open, setOpen] = useState(false);

  const enabled = body.trim().length > 0 && Boolean(spaceId);

  const submit = () => {
    if (!enabled) return;
    onPost(body.trim(), spaceId as string);
    setBody("");
    setOpen(false);
  };

  return (
    <div className="rounded-md border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start gap-3 p-4">
        <MemberAvatar member={currentMember} size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            value={body}
            aria-label="Write a post"
            onFocus={() => setOpen(true)}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share something with your community…"
            className="w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            rows={open ? 4 : 1}
          />
          {open && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <label
                  htmlFor="composer-space"
                  className="text-xs text-muted-foreground"
                >
                  Post to
                </label>
                <select
                  id="composer-space"
                  value={spaceId}
                  onChange={(e) => setSpaceId(e.target.value)}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  <span>Checked before it posts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Attach image"
                    className="text-muted-foreground"
                  >
                    <ImagePlus className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    disabled={!enabled || pending}
                    onClick={submit}
                    className={cn(!enabled && "opacity-60")}
                  >
                    <Send className="size-3.5" />
                    {pending ? "Posting…" : "Post"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
