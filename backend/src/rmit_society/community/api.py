"""Community bounded context: HTTP interface (societies, content, engagement)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    require_active_user,
    require_admin,
    resolve_current_user,
)
from rmit_society.community.application import (
    ContentService,
    EngagementService,
    SocietyService,
    author_feed,
    following_feed,
    joined_feed,
    school_feed,
    society_feed,
)
from rmit_society.community.domain import (
    Comment,
    CommentCreate,
    Notification,
    Post,
    PostCreate,
    Report,
    ReportCreate,
    Society,
    SocietyCreate,
    SocietyMembership,
    SocietyUpdate,
)
from rmit_society.errors import NotFoundError
from rmit_society.identity import application as identity_service
from rmit_society.repositories.factory import get_repository

repo = get_repository()
router = APIRouter(tags=["societies", "content", "engagement"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]
AdminUser = Annotated[AuthenticatedUser, Depends(require_admin)]

content = ContentService(repo)
engagements = EngagementService(repo)


def _load_posts(content_ids: list[str]) -> list[Post]:
    items: list[Post] = []
    for content_id in content_ids:
        post = repo.get_post(content_id)
        if post and not post.deleted and post.state in ("APPROVED", "FLAGGED"):
            items.append(post)
    return items


# --------------------------------------------------------------------------- #
# Societies
# --------------------------------------------------------------------------- #


@router.get("/societies", response_model=list[Society])
async def list_societies(user: CurrentUser) -> list[Society]:
    return await run_in_threadpool(SocietyService.list, repo)


@router.post("/societies", response_model=Society, status_code=status.HTTP_201_CREATED)
async def create_society(admin: AdminUser, payload: SocietyCreate) -> Society:
    return await run_in_threadpool(
        SocietyService.create, repo, actor_user_id=admin.user_id, payload=payload
    )


@router.get("/r/{slug}", response_model=Society)
async def society(user: CurrentUser, slug: str) -> Society:
    try:
        return await run_in_threadpool(SocietyService.get, repo, slug)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@router.patch("/r/{slug}", response_model=Society)
async def update_society(user: ActiveUser, slug: str, payload: SocietyUpdate) -> Society:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    return await run_in_threadpool(
        SocietyService.update,
        repo,
        society=society,
        actor_user_id=user.user_id,
        payload=payload,
    )


@router.post("/r/{slug}/join", status_code=status.HTTP_204_NO_CONTENT)
async def join(user: ActiveUser, slug: str) -> None:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    await run_in_threadpool(
        SocietyService.join, repo, society_id=society.society_id, user_id=user.user_id
    )


@router.delete("/r/{slug}/join", status_code=status.HTTP_204_NO_CONTENT)
async def leave(user: ActiveUser, slug: str) -> None:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    await run_in_threadpool(
        SocietyService.leave, repo, society_id=society.society_id, user_id=user.user_id
    )


@router.get("/r/{slug}/members", response_model=list[SocietyMembership])
async def members(user: CurrentUser, slug: str) -> list[SocietyMembership]:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    return await run_in_threadpool(SocietyService.list_members, repo, society.society_id)


@router.put("/r/{slug}/moderators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_moderator(user: ActiveUser, slug: str, user_id: str) -> None:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    await run_in_threadpool(
        SocietyService.set_moderator,
        repo,
        society_id=society.society_id,
        actor_user_id=user.user_id,
        target_user_id=user_id,
        is_moderator=True,
    )


@router.delete("/r/{slug}/moderators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_moderator(user: ActiveUser, slug: str, user_id: str) -> None:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    await run_in_threadpool(
        SocietyService.set_moderator,
        repo,
        society_id=society.society_id,
        actor_user_id=user.user_id,
        target_user_id=user_id,
        is_moderator=False,
    )


# --------------------------------------------------------------------------- #
# Content (posts and comments)
# --------------------------------------------------------------------------- #


@router.post("/r/{slug}/posts", response_model=Post, status_code=status.HTTP_201_CREATED)
async def create_post(user: ActiveUser, slug: str, payload: PostCreate) -> Post:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    return await run_in_threadpool(
        content.create_post,
        author_user_id=user.user_id,
        society_id=society.society_id,
        society_slug=society.slug,
        payload=payload,
        institution_id=user.institution_id,
    )


@router.get("/r/{slug}/posts")
async def society_posts(user: CurrentUser, slug: str) -> dict[str, object]:
    society = await run_in_threadpool(SocietyService.get, repo, slug)
    pinned = await run_in_threadpool(repo.get_post_by_society_pinned, society.society_id)
    feed = await run_in_threadpool(society_feed, repo, society.society_id)

    def load(post_id: str) -> Post | None:
        post = repo.get_post(post_id)
        if post and not post.deleted and post.state in ("APPROVED", "FLAGGED"):
            return post
        return None

    items = [p for p in (load(pid) for pid in feed) if p is not None]
    return {"items": items, "pinned": pinned, "next_cursor": None}


@router.get("/posts/{post_id}", response_model=Post)
async def get_post(user: ActiveUser, post_id: str) -> Post:
    try:
        return await run_in_threadpool(content.get_post, post_id, actor_user_id=user.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=error.message) from error


@router.patch("/posts/{post_id}", response_model=Post)
async def edit_post(user: ActiveUser, post_id: str, payload: PostCreate) -> Post:
    return await run_in_threadpool(
        content.edit_post,
        post_id=post_id,
        user_id=user.user_id,
        body=payload.body,
        title=payload.title,
    )


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(user: ActiveUser, post_id: str) -> None:
    await run_in_threadpool(content.delete_post, post_id=post_id, user_id=user.user_id)


@router.post(
    "/posts/{post_id}/comments", response_model=Comment, status_code=status.HTTP_201_CREATED
)
async def create_comment(user: ActiveUser, post_id: str, payload: CommentCreate) -> Comment:
    return await run_in_threadpool(
        content.create_comment,
        post_id=post_id,
        author_user_id=user.user_id,
        payload=payload,
        depth=0,
        institution_id=user.institution_id,
    )


@router.get("/posts/{post_id}/comments", response_model=list[Comment])
async def list_comments(user: CurrentUser, post_id: str) -> list[Comment]:
    comments = await run_in_threadpool(repo.list_comments, post_id)
    return [c for c in comments if not c.deleted]


@router.post(
    "/comments/{comment_id}/comments", response_model=Comment, status_code=status.HTTP_201_CREATED
)
async def reply(user: ActiveUser, comment_id: str, payload: CommentCreate) -> Comment:
    parent = await run_in_threadpool(content.get_comment, comment_id, actor_user_id=user.user_id)
    return await run_in_threadpool(
        content.create_comment,
        post_id=parent.post_id,
        author_user_id=user.user_id,
        payload=payload,
        parent_comment_id=comment_id,
        depth=parent.depth + 1,
        institution_id=user.institution_id,
    )


@router.patch("/comments/{comment_id}", response_model=Comment)
async def edit_comment(user: ActiveUser, comment_id: str, payload: CommentCreate) -> Comment:
    return await run_in_threadpool(
        content.edit_comment, comment_id=comment_id, user_id=user.user_id, body=payload.body
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(user: ActiveUser, comment_id: str) -> None:
    await run_in_threadpool(content.delete_comment, comment_id=comment_id, user_id=user.user_id)


@router.post("/posts/{post_id}/pin", response_model=Post)
async def toggle_pin(
    user: ActiveUser, post_id: str, pinned: Annotated[bool, Query()] = True
) -> Post:
    post = await run_in_threadpool(content.get_post, post_id, actor_user_id=user.user_id)
    return await run_in_threadpool(
        content.set_pin,
        post_id=post_id,
        user_id=user.user_id,
        society_id=post.society_id,
        pinned=pinned,
    )


@router.post("/posts/{post_id}/lock", response_model=Post)
async def toggle_lock(
    user: ActiveUser, post_id: str, locked: Annotated[bool, Query()] = True
) -> Post:
    post = await run_in_threadpool(content.get_post, post_id, actor_user_id=user.user_id)
    return await run_in_threadpool(
        content.toggle_lock,
        post_id=post_id,
        user_id=user.user_id,
        society_id=post.society_id,
        locked=locked,
    )


# --------------------------------------------------------------------------- #
# Engagement (votes, follows, blocks, reports, notifications, feeds)
# --------------------------------------------------------------------------- #


@router.put("/posts/{post_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def vote_post(user: ActiveUser, post_id: str) -> None:
    await run_in_threadpool(engagements.vote, content_id=post_id, user_id=user.user_id)


@router.delete("/posts/{post_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def unvote_post(user: ActiveUser, post_id: str) -> None:
    await run_in_threadpool(engagements.unvote, content_id=post_id, user_id=user.user_id)


@router.put("/comments/{comment_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def vote_comment(user: ActiveUser, comment_id: str) -> None:
    await run_in_threadpool(engagements.vote, content_id=comment_id, user_id=user.user_id)


@router.delete("/comments/{comment_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def unvote_comment(user: ActiveUser, comment_id: str) -> None:
    await run_in_threadpool(engagements.unvote, content_id=comment_id, user_id=user.user_id)


@router.put("/users/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow(user: ActiveUser, user_id: str) -> None:
    await run_in_threadpool(
        engagements.follow, target_user_id=user_id, follower_user_id=user.user_id
    )


@router.delete("/users/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow(user: ActiveUser, user_id: str) -> None:
    await run_in_threadpool(
        engagements.unfollow, target_user_id=user_id, follower_user_id=user.user_id
    )


@router.put("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block(user: ActiveUser, user_id: str) -> None:
    await run_in_threadpool(engagements.block, target_user_id=user_id, blocker_user_id=user.user_id)


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user: ActiveUser, user_id: str) -> None:
    await run_in_threadpool(
        engagements.unblock, target_user_id=user_id, blocker_user_id=user.user_id
    )


@router.post("/reports", response_model=Report, status_code=status.HTTP_201_CREATED)
async def report(user: ActiveUser, payload: ReportCreate) -> Report:
    return await run_in_threadpool(
        engagements.report, reporter_user_id=user.user_id, payload=payload
    )


@router.get("/notifications", response_model=list[Notification])
async def notifications(user: CurrentUser) -> list[Notification]:
    return await run_in_threadpool(engagements.list_notifications, user.user_id)


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(user: ActiveUser, notification_id: str) -> None:
    await run_in_threadpool(
        engagements.mark_read, notification_id=notification_id, user_id=user.user_id
    )


@router.get("/feeds/rmit")
async def school_feed_route(user: CurrentUser) -> dict[str, object]:
    feed = await run_in_threadpool(school_feed, repo)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/feeds/joined")
async def joined_feed_route(user: ActiveUser) -> dict[str, object]:
    feed = await run_in_threadpool(joined_feed, repo, user.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/feeds/following")
async def following_feed_route(user: ActiveUser) -> dict[str, object]:
    feed = await run_in_threadpool(following_feed, repo, user.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/users/{handle}/posts")
async def author_posts(user: CurrentUser, handle: str) -> dict[str, object]:
    author = await run_in_threadpool(identity_service.get_user_by_handle, repo, handle)
    feed = await run_in_threadpool(author_feed, repo, author.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}



app = create_api("RMIT Society community")
app.include_router(router)
