import { ArrowLeft, Users } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useSociety, useSocietyPosts } from "@/lib/api/queries";
import { toSpace } from "@/lib/model";

import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SpacePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const slug = id ?? "";

  const society = useSociety(slug);
  const posts = useSocietyPosts(slug);

  if (society.isLoading || posts.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="ml-2 text-sm">Loading space…</span>
      </div>
    );
  }

  if (society.isError || !society.data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Space not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This club board doesn’t exist or isn’t available to you.
        </p>
      </div>
    );
  }

  const sp = toSpace(society.data);
  const fmt = Intl.NumberFormat("en-AU", { notation: "compact" }).format(
    sp.members
  );
  const items = posts.data?.items ?? [];

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Button>

      <section className="rounded-md border border-border bg-card p-6">
        <div className="flex items-start gap-5">
          <span
            className="flex size-16 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-black text-white"
            style={{ background: `oklch(0.55 0.15 ${sp.hue})` }}
          >
            {sp.curie}
          </span>
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">
              {sp.name}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-4" />
              <span className="tabular-nums">{fmt}</span> members
            </p>
            <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-foreground/80">
              {sp.description}
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Posts" className="space-y-4">
        {items.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
            <p className="font-display text-2xl font-black tracking-tight">
              No posts yet
            </p>
            <p className="mt-1 text-sm">
              Approved and flagged flyers for this club will show up here.
            </p>
          </div>
        )}
        {items.map((p) => (
          <PostCard
            key={p.post_id}
            post={p}
            space={sp}
            onOpen={(pid) => navigate(`/post/${pid}`)}
          />
        ))}
      </section>
    </div>
  );
}
