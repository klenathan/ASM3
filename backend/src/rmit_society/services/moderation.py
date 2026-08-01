from __future__ import annotations

from typing import Any

from rmit_society.base import new_id, utc_now
from rmit_society.config import get_settings
from rmit_society.domain.enums import (
    AppealState,
    ContentState,
    ModerationDecision,
    ReportState,
    RiskLevel,
)
from rmit_society.domain.events import AuditEvent
from rmit_society.domain.moderation import (
    Appeal,
    AppealCreate,
    LabelResult,
    ModerationDecisionRecord,
    ModerationReview,
)
from rmit_society.errors import AuthorizationError, ConflictError, NotFoundError
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import engagement as engagement_service


def _resolve_risk(labels: list[LabelResult]) -> RiskLevel:
    if not labels:
        return RiskLevel.LOW
    top = max(labels, key=lambda label: label.score)
    if top.score >= 0.85:
        return RiskLevel.HIGH
    if top.score >= 0.4:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


class ModerationService:
    def __init__(
        self,
        repo: DynamoDBRepository,
        engagements: engagement_service.EngagementService | None = None,
    ) -> None:
        self.repo = repo
        self.engagements = engagements or engagement_service.EngagementService(repo)

    def queue(self, state: str) -> list[str]:
        return self.repo.list_queue(state)

    def open_reports(self) -> list[Any]:
        return self.repo.list_open_reports()

    def moderate(
        self,
        *,
        content_id: str,
        content_type: str,
        actor_user_id: str,
        society_id: str,
        review: ModerationReview,
    ) -> None:
        if not self.repo.is_moderator(society_id, actor_user_id):
            raise AuthorizationError("Moderator role required")
        current = (
            self.repo.get_post(content_id)
            if content_type == "post"
            else self.repo.get_comment(content_id)
        )
        if current is None:
            raise NotFoundError("Content not found")

        decision = review.decision
        if decision == ModerationDecision.APPROVE:
            new_state = ContentState.APPROVED
            requires_warning = False
        elif decision == ModerationDecision.FLAG:
            new_state = ContentState.FLAGGED
            requires_warning = review.requires_warning
        elif decision == ModerationDecision.REJECT:
            new_state = ContentState.REJECTED
            requires_warning = False
        else:
            raise ConflictError("Unsupported decision")

        if not self.repo.transition_state(
            content_id,
            current.state.value,
            new_state.value,
            requires_warning=requires_warning,
            **self._mod_attrs(content_id, review, new_state),
        ):
            raise ConflictError("Content state changed during review")

        decision_record = ModerationDecisionRecord(
            content_id=content_id,
            content_type=content_type,
            version=int(getattr(current, "version", 1)),
            decision=decision,
            actor_type="moderator",
            actor_user_id=actor_user_id,
            reason=review.reason,
            labels=[],
            provider="human",
            model_version="human",
            policy_version=get_settings().policy_version,
            risk_level=_resolve_risk([]),
            created_at=utc_now(),
            institution_id="rmit",
        )
        self.repo.record_decision(decision_record)
        self._audit(
            target_id=content_id,
            actor_user_id=actor_user_id,
            action=f"MODERATOR_{decision.value}",
            before={"state": current.state.value},
            after={"state": new_state.value, "reason": review.reason},
        )
        self.engagements.notify_moderation(
            recipient=getattr(current, "author_user_id", ""), content_id=content_id
        )

    def _mod_attrs(
        self, content_id: str, review: ModerationReview, new_state: ContentState
    ) -> dict[str, object]:
        del content_id
        if new_state == ContentState.REJECTED:
            return {"requires_warning": False}
        return {"requires_warning": review.requires_warning}

    def create_appeal(
        self, *, content_id: str, content_type: str, appellant_user_id: str, payload: AppealCreate
    ) -> Appeal:
        current = (
            self.repo.get_post(content_id)
            if content_type == "post"
            else self.repo.get_comment(content_id)
        )
        if current is None:
            raise NotFoundError("Content not found")
        if getattr(current, "author_user_id", None) != appellant_user_id:
            raise AuthorizationError("Only the author may appeal")
        if current.state not in (ContentState.REJECTED,):
            raise ConflictError("Content is not in an appealable state")
        appeal = Appeal(
            appeal_id=new_id("ap"),
            content_id=content_id,
            content_type=content_type,
            appellant_user_id=appellant_user_id,
            context=payload.context,
            created_at=utc_now(),
            updated_at=utc_now(),
            institution_id="rmit",
        )
        if not self.repo.create_appeal(appeal):
            raise ConflictError("An open appeal already exists for this content")
        return appeal

    def list_appeals(self, state: AppealState = AppealState.OPEN) -> list[Appeal]:
        return self.repo.list_appeals(state.value)

    def decide_appeal(
        self, *, appeal_id: str, reviewer_user_id: str, upheld: bool, reason: str
    ) -> Appeal:
        appeal = self.repo.get_appeal(appeal_id)
        if appeal is None:
            raise NotFoundError("Appeal not found")
        if appeal.state != AppealState.OPEN:
            raise ConflictError("Appeal already resolved")
        reversed_ = not upheld
        self.repo.update_appeal(
            appeal_id,
            state=AppealState.REVERSED.value if reversed_ else AppealState.UPHELD.value,
            decision_reason=reason,
            reviewer_user_id=reviewer_user_id,
            updated_at=utc_now(),
            gsi_appeal_pk=f"APPEALQUEUE#{'REVERSED' if reversed_ else 'UPHELD'}",
        )
        if reversed_:
            current = (
                self.repo.get_post(appeal.content_id)
                if appeal.content_type == "post"
                else self.repo.get_comment(appeal.content_id)
            )
            if current is not None:
                self.repo.transition_state(
                    appeal.content_id,
                    current.state.value,
                    ContentState.APPROVED.value,
                    requires_warning=False,
                )
        self._audit(
            target_id=appeal.appeal_id,
            actor_user_id=reviewer_user_id,
            action="APPEAL_REVERSED" if reversed_ else "APPEAL_UPHELD",
            before={"state": appeal.state.value},
            after={
                "outcome": AppealState.REVERSED.value if reversed_ else AppealState.UPHELD.value
            },
        )
        self.engagements.notify_appeal(
            recipient=appeal.appellant_user_id, content_id=appeal.content_id
        )
        updated = self.repo.get_appeal(appeal_id)
        return updated if updated is not None else appeal

    def audit(self, *, target_type: str, target_id: str) -> list[AuditEvent]:
        return self.repo.list_audit(target_type, target_id)

    def resolve_report(self, *, report_id: str, action: str, actor_user_id: str) -> None:
        state = ReportState.RESOLVED.value if action == "resolve" else ReportState.DISMISSED.value
        self.repo.resolve_report(report_id, state)
        self._audit(
            target_id=report_id,
            actor_user_id=actor_user_id,
            action=f"REPORT_{action.upper()}",
            before={},
            after={"state": state},
        )

    def _audit(
        self,
        *,
        target_id: str,
        actor_user_id: str,
        action: str,
        before: dict[str, Any],
        after: dict[str, Any],
    ) -> None:
        event = AuditEvent(
            event_id=new_id("ae"),
            target_type="moderation",
            target_id=target_id,
            actor_user_id=actor_user_id,
            action=action,
            before=before,
            after=after,
            created_at=utc_now(),
            institution_id="rmit",
        )
        self.repo.append_audit(event)
