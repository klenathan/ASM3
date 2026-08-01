from __future__ import annotations

from rmit_society.domain.enums import ModerationCategory, ModerationDecision, RiskLevel
from rmit_society.domain.moderation import LabelResult, ModerationOutcome

_THRESHOLDS = {
    "flag_score": 0.4,
    "reject_score": 0.85,
}

# Deterministic keyword rules used by the local adapter. Fixtures only; never
# shipped as the moderation provider in production.
_RULES: list[tuple[ModerationCategory, float, tuple[str, ...]]] = [
    (ModerationCategory.HATE, 0.95, ("hate", "bigot", "slur")),
    (ModerationCategory.VIOLENCE, 0.9, ("kill you", "i will hurt", "threat")),
    (ModerationCategory.HARASSMENT, 0.7, ("bully", "harass")),
    (ModerationCategory.SEXUAL, 0.7, ("nsfw", "explicit")),
    (ModerationCategory.PROFANITY, 0.5, ("fuck", "shit", "damn")),
]


class LocalTextModerator:
    """Deterministic, offline text moderation for local development/tests."""

    provider_name = "local-text"
    model_version = "local-v1"

    def __init__(self, policy_version: str = "1") -> None:
        self.policy_version = policy_version

    def moderate_text(self, text: str, *, content_id: str) -> ModerationOutcome:
        del content_id
        lowered = text.lower()
        labels: list[LabelResult] = []
        for category, score, keywords in _RULES:
            if any(keyword in lowered for keyword in keywords):
                labels.append(LabelResult(category=category, score=score))

        if not labels:
            return ModerationOutcome(
                decision=ModerationDecision.APPROVE,
                risk_level=RiskLevel.LOW,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self.policy_version,
            )

        labels.sort(key=lambda label: label.score, reverse=True)
        top = labels[0]
        if top.score >= _THRESHOLDS["reject_score"]:
            return ModerationOutcome(
                decision=ModerationDecision.REJECT,
                risk_level=RiskLevel.HIGH,
                labels=labels,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self.policy_version,
            )
        if top.score >= _THRESHOLDS["flag_score"]:
            return ModerationOutcome(
                decision=ModerationDecision.FLAG,
                risk_level=RiskLevel.MEDIUM,
                labels=labels,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self.policy_version,
                requires_warning=True,
            )
        return ModerationOutcome(
            decision=ModerationDecision.APPROVE,
            risk_level=RiskLevel.LOW,
            labels=labels,
            provider=self.provider_name,
            model_version=self.model_version,
            policy_version=self.policy_version,
        )
