from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    require_active_user,
    resolve_current_user,
)
from rmit_society.domain.content import Post
from rmit_society.domain.engagement import Notification, Report, ReportCreate
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import feeds
from rmit_society.services import identity as identity_service
from rmit_society.services.engagement import EngagementService

repo = DynamoDBRepository()
engagements = EngagementService(repo)
router = APIRouter(tags=["engagement"])
CurrentUser = Annotated[AuthenticatedUser, Depends(resolve_current_user)]
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]


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
async def school_feed(user: CurrentUser) -> dict[str, object]:
    feed = await run_in_threadpool(feeds.school_feed, repo)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/feeds/joined")
async def joined_feed(user: ActiveUser) -> dict[str, object]:
    feed = await run_in_threadpool(feeds.joined_feed, repo, user.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/feeds/following")
async def following_feed(user: ActiveUser) -> dict[str, object]:
    feed = await run_in_threadpool(feeds.following_feed, repo, user.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}


@router.get("/users/{handle}/posts")
async def author_posts(user: CurrentUser, handle: str) -> dict[str, object]:
    author = await run_in_threadpool(identity_service.get_user_by_handle, repo, handle)
    feed = await run_in_threadpool(feeds.author_feed, repo, author.user_id)
    return {"items": _load_posts(feed), "next_cursor": None}


def _load_posts(content_ids: list[str]) -> list[Post]:
    items: list[Post] = []
    for content_id in content_ids:
        post = repo.get_post(content_id)
        if post and not post.deleted and post.state in ("APPROVED", "FLAGGED"):
            items.append(post)
    return items


app = create_api("RMIT Society engagement")
app.include_router(router)
handler = Mangum(app, lifespan="off")
