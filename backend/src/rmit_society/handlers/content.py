from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    require_active_user,
    resolve_current_user,
)
from rmit_society.domain.content import (
    Comment,
    CommentCreate,
    Post,
    PostCreate,
)
from rmit_society.errors import NotFoundError
from rmit_society.repositories.factory import get_repository
from rmit_society.services import content as content_service
from rmit_society.services import feeds
from rmit_society.services import societies as societies_service

repo = get_repository()
content = content_service.ContentService(repo)
router = APIRouter(tags=["content"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]


@router.post("/r/{slug}/posts", response_model=Post, status_code=status.HTTP_201_CREATED)
async def create_post(user: ActiveUser, slug: str, payload: PostCreate) -> Post:
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
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
    society = await run_in_threadpool(societies_service.get_society, repo, slug)
    pinned = await run_in_threadpool(repo.get_post_by_society_pinned, society.society_id)
    feed = await run_in_threadpool(feeds.society_feed, repo, society.society_id)

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


app = create_api("RMIT Society content")
app.include_router(router)
handler = Mangum(app, lifespan="off")
