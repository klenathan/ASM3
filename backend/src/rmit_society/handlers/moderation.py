from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from rmit_society.api import create_api
from rmit_society.auth.dependencies import (
    AuthenticatedUser,
    ModeratorUser,
    require_active_user,
)
from rmit_society.domain.enums import AppealState, RiskLevel
from rmit_society.domain.events import AuditEvent
from rmit_society.domain.moderation import (
    Appeal,
    AppealCreate,
    ModerationDecisionRecord,
    ModerationReview,
)
from rmit_society.repositories.factory import get_repository
from rmit_society.services import engagement as engagement_service
from rmit_society.services.moderation import ModerationService

repo = get_repository()
moderation = ModerationService(repo, engagement_service.EngagementService(repo))
router = APIRouter(tags=["moderation"])
ActiveUser = Annotated[AuthenticatedUser, Depends(require_active_user)]
ModUser = ModeratorUser


@router.get("/moderation/queue")
async def queue(user: ModUser, state: str = "PENDING") -> dict[str, object]:
    content_ids = await run_in_threadpool(moderation.queue, state)
    return {"items": content_ids, "next_cursor": None}


@router.get("/moderation/items/{content_id}")
async def moderation_item(user: ModUser, content_id: str) -> dict[str, object]:
    post = repo.get_post(content_id)
    comment = repo.get_comment(content_id)
    item: object
    content_type: str
    if post:
        item = post
        content_type = "post"
    elif comment:
        item = comment
        content_type = "comment"
    else:
        raise HTTPException(status_code=404, detail="Content not found")
    return {"content_type": content_type, "content": item}


@router.post("/moderation/items/{content_id}/decisions", response_model=ModerationDecisionRecord)
async def decide(
    user: ModUser, content_id: str, content_type: str, review: ModerationReview
) -> ModerationDecisionRecord:
    content = repo.get_post(content_id) if content_type == "post" else repo.get_comment(content_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    society_id = getattr(content, "society_id", "rmit")
    await run_in_threadpool(
        moderation.moderate,
        content_id=content_id,
        content_type=content_type,
        actor_user_id=user.user_id,
        society_id=society_id,
        review=review,
    )
    return ModerationDecisionRecord(
        content_id=content_id,
        content_type=content_type,
        version=getattr(content, "version", 1),
        decision=review.decision,
        actor_type="moderator",
        actor_user_id=user.user_id,
        reason=review.reason,
        provider="human",
        model_version="human",
        policy_version="1",
        risk_level=RiskLevel.MEDIUM,
        created_at=content.created_at,
    )


@router.post(
    "/content/{content_id}/appeals", response_model=Appeal, status_code=status.HTTP_201_CREATED
)
async def appeal(
    user: ActiveUser, content_id: str, content_type: str, payload: AppealCreate
) -> Appeal:
    return await run_in_threadpool(
        moderation.create_appeal,
        content_id=content_id,
        content_type=content_type,
        appellant_user_id=user.user_id,
        payload=payload,
    )


@router.get("/moderation/appeals", response_model=list[Appeal])
async def appeals(user: ModUser, state: AppealState = AppealState.OPEN) -> list[Appeal]:
    return await run_in_threadpool(moderation.list_appeals, state)


@router.post("/moderation/appeals/{appeal_id}/decision", response_model=Appeal)
async def decide_appeal(user: ModUser, appeal_id: str, upheld: bool, reason: str) -> Appeal:
    return await run_in_threadpool(
        moderation.decide_appeal,
        appeal_id=appeal_id,
        reviewer_user_id=user.user_id,
        upheld=upheld,
        reason=reason,
    )


@router.get("/audit/{target_type}/{target_id}", response_model=list[AuditEvent])
async def audit(user: ModUser, target_type: str, target_id: str) -> list[AuditEvent]:
    return await run_in_threadpool(moderation.audit, target_type=target_type, target_id=target_id)


app = create_api("RMIT Society moderation")
app.include_router(router)
handler = Mangum(app, lifespan="off")
