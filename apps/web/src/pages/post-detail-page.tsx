import { ArrowLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import {
  useComments,
  useCreateComment,
  usePost,
} from "@/lib/api/queries";
import type { Comment } from "@/lib/api/types";
import { toMember, timeAgo } from "@/lib/model";

import { MemberAvatar } from "@/components/member-bits";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function PostDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const postQ = usePost(id);
  const commentsQ = useComments(id);
  const createComment = useCreateComment();

  const [draft, setDraft] = useState("");

  const post = postQ.data;

  const submit = () => {
    if (!draft.trim() || !id) return;
    createComment.mutate(
      { postId: id, payload: { body: draft.trim() } },
      {
        onSuccess: () => setDraft(""),
      }
    );
  };

  if (postQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="ml-2 text-sm">Loading post…</span>
      </div>
    );
  }

  if (postQ.isError || !post) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Post not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been removed, or it isn’t available to you.
        </p>
      </div>
    );
  }

  const replies = commentsQ.data ?? [];
  const threaded = buildThread(replies);

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

      <PostCard post={post} />

      <section aria-label="Replies" className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageCircle className="size-4" />
          <span className="tabular-nums">{post.reply_count}</span> replies
        </h2>

        <form
          className="flex items-start gap-3 rounded-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {user && <MemberAvatar member={toMember(user)} size="sm" />}
          <div className="flex-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Write a reply"
              placeholder={post.locked ? "Discussion locked" : "Add to the discussion…"}
              disabled={post.locked}
              className="min-h-16 border-0 bg-transparent px-0 focus-visible:ring-0"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!draft.trim() || post.locked || createComment.isPending}
              >
                {createComment.isPending ? "Replying…" : "Reply"}
              </Button>
            </div>
          </div>
        </form>

        {commentsQ.isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Loading replies…
          </div>
        )}

        <div className="space-y-3">
          {threaded.map((c) => (
            <CommentRow key={c.comment_id} comment={c} depth={0} />
          ))}
        </div>
      </section>
    </div>
  );
}

function buildThread(comments: Comment[]): Comment[] {
  return [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function CommentRow({
  comment,
  depth,
}: {
  comment: Comment;
  depth: number;
}) {
  return (
    <div>
      <div
        className="rounded-md border border-border bg-card p-4"
        style={{ marginLeft: depth * 12 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            @{comment.author_user_id}
          </span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="text-xs text-muted-foreground">
            {timeAgo(comment.created_at)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{comment.body}</p>
      </div>
    </div>
  );
}
