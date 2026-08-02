import { describe, expect, it } from "vitest"

import type { Comment } from "../societies/types"
import { buildCommentTree } from "./comment-tree"

const comment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  threadId: "thread-1",
  authorId: "user-1",
  parentId: null,
  body: "Comment body",
  status: "published",
  score: 0,
  authorDisplayName: "Student",
  authorAvatarMediaId: null,
  myVote: 0,
  createdAt: "2026-02-01T12:00:00.000Z",
  updatedAt: "2026-02-01T12:00:00.000Z",
  deletedAt: null,
  ...overrides,
})

describe("buildCommentTree", () => {
  it("keeps descendants with their root and orders each branch by score", () => {
    const tree = buildCommentTree([
      comment("root-low", { score: 2 }),
      comment("reply-low", { parentId: "root-low", score: 1 }),
      comment("reply-high", { parentId: "root-low", score: 9 }),
      comment("root-high", { score: 7 }),
    ], "best")

    expect(tree.map((item) => item.id)).toEqual(["root-high", "root-low"])
    expect(tree[1]?.children.map((item) => item.id)).toEqual(["reply-high", "reply-low"])
  })

  it("orders newest comments first when requested", () => {
    const tree = buildCommentTree([
      comment("older", { createdAt: "2026-02-01T12:00:00.000Z" }),
      comment("newer", { createdAt: "2026-02-02T12:00:00.000Z" }),
    ], "new")

    expect(tree.map((item) => item.id)).toEqual(["newer", "older"])
  })
})
