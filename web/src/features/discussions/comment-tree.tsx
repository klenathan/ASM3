import { ArrowBigDown, ArrowBigUp, ChevronRight, MessageCircle } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "../../components/ui/button"
import type { Comment } from "../societies/types"
import { timeAgo } from "./use-thread-vote"
import { CommentComposer } from "./comment-composer"
import { MarkdownContent } from "./markdown-content"

export type CommentSort = "best" | "new"

interface CommentNode extends Comment {
  readonly children: readonly CommentNode[]
}

export function buildCommentTree(comments: readonly Comment[], sort: CommentSort): readonly CommentNode[] {
  const byId = new Map<string, CommentNode>()
  for (const comment of comments) byId.set(comment.id, { ...comment, children: [] })

  const roots: CommentNode[] = []
  for (const comment of byId.values()) {
    if (comment.parentId === null) {
      roots.push(comment)
      continue
    }
    const parent = byId.get(comment.parentId)
    if (parent === undefined) roots.push(comment)
    else (parent.children as CommentNode[]).push(comment)
  }

  const compare = sort === "best"
    ? (a: CommentNode, b: CommentNode) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    : (a: CommentNode, b: CommentNode) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  const order = (nodes: readonly CommentNode[]): readonly CommentNode[] => [...nodes]
    .sort(compare)
    .map((node) => ({ ...node, children: order(node.children) }))

  return order(roots)
}

export function CommentTree({
  comments,
  sort,
  canInteract,
  isSubmitting,
  submitError,
  onReply,
  onVote,
}: {
  readonly comments: readonly Comment[]
  readonly sort: CommentSort
  readonly canInteract: boolean
  readonly isSubmitting: boolean
  readonly submitError?: string
  readonly onReply: (parentId: string, body: string) => Promise<void>
  readonly onVote: (commentId: string, value: -1 | 0 | 1) => void
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const nodes = buildCommentTree(comments, sort)

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <CommentBranch
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          replyingTo={replyingTo}
          canInteract={canInteract}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onToggle={toggle}
          onReplyingTo={setReplyingTo}
          onReply={onReply}
          onVote={onVote}
        />
      ))}
    </div>
  )
}

function CommentBranch({
  node,
  depth,
  collapsed,
  replyingTo,
  canInteract,
  isSubmitting,
  submitError,
  onToggle,
  onReplyingTo,
  onReply,
  onVote,
}: {
  readonly node: CommentNode
  readonly depth: number
  readonly collapsed: ReadonlySet<string>
  readonly replyingTo: string | null
  readonly canInteract: boolean
  readonly isSubmitting: boolean
  readonly submitError?: string
  readonly onToggle: (id: string) => void
  readonly onReplyingTo: (id: string | null) => void
  readonly onReply: (parentId: string, body: string) => Promise<void>
  readonly onVote: (commentId: string, value: -1 | 0 | 1) => void
}) {
  const isCollapsed = collapsed.has(node.id)
  const hasReplies = node.children.length > 0
  const canReply = canInteract && depth < 2
  const author = node.authorDisplayName ?? "[deleted]"

  return (
    <article
      className="relative border-t border-foreground/15 py-5 first:border-t-0"
      style={{ marginLeft: depth === 0 ? 0 : `${Math.min(depth, 3) * 1.15}rem` }}
    >
      {depth > 0 && <span aria-hidden="true" className="absolute top-0 bottom-0 -left-3 w-px bg-foreground/20" />}
      <div className="flex items-start gap-2">
        {hasReplies ? (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `Show ${node.children.length} replies` : "Collapse replies"}
            onClick={() => onToggle(node.id)}
            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight aria-hidden="true" className={`size-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
          </button>
        ) : <span className="size-6 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {node.authorDisplayName === null ? <span>{author}</span> : (
              <Link to={`/u/${node.authorId}`} className="font-semibold text-foreground hover:text-primary">u/{author}</Link>
            )}
            <span>{node.score} point{node.score === 1 ? "" : "s"}</span>
            <span>{timeAgo(node.createdAt)}</span>
          </div>

          {isCollapsed ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="mt-2 text-sm font-medium text-muted-foreground hover:text-primary"
            >
              {node.children.length} hidden repl{node.children.length === 1 ? "y" : "ies"}
            </button>
          ) : (
            <>
              {node.body === null ? (
                <p className="mt-3 text-sm italic text-muted-foreground">This comment is no longer available.</p>
              ) : <div className="mt-2"><MarkdownContent compact>{node.body}</MarkdownContent></div>}
              <div className="mt-3 flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label="Upvote comment"
                  aria-pressed={node.myVote === 1}
                  disabled={!canInteract}
                  onClick={() => onVote(node.id, node.myVote === 1 ? 0 : 1)}
                  className={node.myVote === 1 ? "text-primary" : ""}
                ><ArrowBigUp aria-hidden="true" /> Upvote</Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label="Downvote comment"
                  aria-pressed={node.myVote === -1}
                  disabled={!canInteract}
                  onClick={() => onVote(node.id, node.myVote === -1 ? 0 : -1)}
                  className={node.myVote === -1 ? "text-primary" : ""}
                ><ArrowBigDown aria-hidden="true" /> Downvote</Button>
                {canReply && <Button type="button" variant="ghost" size="xs" onClick={() => onReplyingTo(replyingTo === node.id ? null : node.id)}><MessageCircle aria-hidden="true" /> Reply</Button>}
              </div>
              {replyingTo === node.id && (
                <div className="mt-4">
                  <CommentComposer
                    label={`Reply to ${author}`}
                    submitLabel="Reply"
                    isSubmitting={isSubmitting}
                    error={submitError}
                    onCancel={() => onReplyingTo(null)}
                    onSubmit={async (body) => {
                      await onReply(node.id, body)
                      onReplyingTo(null)
                    }}
                  />
                </div>
              )}
              {hasReplies && (
                <div className="mt-3">
                  {node.children.map((child) => (
                    <CommentBranch
                      key={child.id}
                      node={child}
                      depth={depth + 1}
                      collapsed={collapsed}
                      replyingTo={replyingTo}
                      canInteract={canInteract}
                      isSubmitting={isSubmitting}
                      submitError={submitError}
                      onToggle={onToggle}
                      onReplyingTo={onReplyingTo}
                      onReply={onReply}
                      onVote={onVote}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
