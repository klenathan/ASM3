from __future__ import annotations

from typing import Any

from rmit_society.base import utc_now
from rmit_society.config import get_settings
from rmit_society.domain.enums import (
    ContentState,
    ModerationDecision,
)
from rmit_society.domain.moderation import ModerationDecisionRecord
from rmit_society.errors import ProviderError
from rmit_society.providers.comprehend import ComprehendTextModerator
from rmit_society.providers.local_moderation import LocalTextModerator
from rmit_society.providers.queues import SQSQueuePublisher
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import feeds


def build_text_moderator() -> Any:
    settings = get_settings()
    if settings.moderation_provider == "aws":
        return ComprehendTextModerator(policy_version=settings.policy_version)
    return LocalTextModerator(policy_version=settings.policy_version)


def moderate_content(event: dict[str, Any]) -> None:
    repo = DynamoDBRepository()
    publisher = SQSQueuePublisher()

    payload = event.get("payload", {})
    content_id = str(payload["content_id"])
    content_type = str(payload["content_type"])
    version = int(payload["version"])

    content = repo.get_post(content_id) if content_type == "post" else repo.get_comment(content_id)
    if content is None or content.deleted:
        return

    if content.state != ContentState.PENDING:
        return

    text = content.body
    # Run a current attempt; provider availability matters for fail-closed behavior.
    try:
        outcome = build_text_moderator().moderate_text(text, content_id=content_id)
    except ProviderError:
        _fail(repo, content_id, version)
        raise

    new_state = {
        ModerationDecision.APPROVE: ContentState.APPROVED,
        ModerationDecision.FLAG: ContentState.FLAGGED,
        ModerationDecision.REJECT: ContentState.REJECTED,
    }.get(outcome.decision, ContentState.FLAGGED)

    changed = repo.transition_state(
        content_id,
        ContentState.PENDING.value,
        new_state.value,
        requires_warning=outcome.requires_warning,
    )
    if changed:
        repo.record_decision(
            ModerationDecisionRecord(
                content_id=content_id,
                content_type=content_type,
                version=version,
                decision=outcome.decision,
                actor_type="ai",
                reason="automated",
                labels=outcome.labels,
                provider=outcome.provider,
                model_version=outcome.model_version,
                policy_version=outcome.policy_version,
                risk_level=outcome.risk_level,
                created_at=utc_now(),
                institution_id="rmit",
            )
        )
        _fan_out(repo, publisher, content_id, content_type, new_state)


def _fail(repo: DynamoDBRepository, content_id: str, version: int) -> None:
    repo.transition_state(content_id, ContentState.PENDING.value, ContentState.FAILED.value)


def _fan_out(
    repo: DynamoDBRepository,
    publisher: SQSQueuePublisher,
    content_id: str,
    content_type: str,
    state: ContentState,
) -> None:
    if content_type == "post":
        post = repo.get_post(content_id)
        if post is None:
            return
        if state in (ContentState.APPROVED, ContentState.FLAGGED):
            feeds.publish_post(repo, post)
        publisher.publish(
            "ContentModerated.v1",
            1,
            {"content_id": content_id, "content_type": content_type, "state": state.value},
        )
