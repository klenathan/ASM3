from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.domain.enums import ModerationCategory, ModerationDecision, RiskLevel
from rmit_society.domain.moderation import LabelResult, ModerationOutcome
from rmit_society.errors import ProviderError

_LABEL_MAP: dict[str, ModerationCategory] = {
    "HATE_SPEECH": ModerationCategory.HATE,
    "HARASSMENT": ModerationCategory.HARASSMENT,
    "SEXUAL": ModerationCategory.SEXUAL,
    "VIOLENCE": ModerationCategory.VIOLENCE,
    "GRAPHIC": ModerationCategory.GRAPHIC,
    "PROFANITY": ModerationCategory.PROFANITY,
    "INSULT": ModerationCategory.HARASSMENT,
}

_REJECT_THRESHOLD = 0.85
_FLAG_THRESHOLD = 0.4


class ComprehendTextModerator:
    """Amazon Comprehend toxic-content classification."""

    provider_name = "aws-comprehend"
    model_version = "detect-toxic-content"

    def __init__(
        self, *, region: str | None = None, language: str = "en", policy_version: str = "1"
    ) -> None:
        self._client: Any = client("comprehend")
        self._language = language
        self._policy_version = policy_version

    def moderate_text(self, text: str, *, content_id: str) -> ModerationOutcome:
        del content_id
        try:
            response = self._client.detect_toxic_content(
                TextSegments=[{"Text": text}],
                LanguageCode=self._language,
            )
        except Exception as error:
            raise ProviderError(f"Comprehend failed: {error}") from error

        results = response.get("Result", {}).get("Toxicity", [])
        labels: list[LabelResult] = []
        for item in results:
            category = _LABEL_MAP.get(item.get("Name", ""), ModerationCategory.UNSUPPORTED)
            score = float(item.get("Score", 0.0))
            if score > 0:
                labels.append(LabelResult(category=category, score=score))

        labels.sort(key=lambda label: label.score, reverse=True)
        if not labels or labels[0].category is ModerationCategory.UNSUPPORTED:
            # "Not analyzed" must never be treated as safe; send to review.
            return ModerationOutcome(
                decision=ModerationDecision.FLAG,
                risk_level=RiskLevel.MEDIUM,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self._policy_version,
                error="unsupported_language",
            )

        top = labels[0]
        if top.score >= _REJECT_THRESHOLD:
            return ModerationOutcome(
                decision=ModerationDecision.REJECT,
                risk_level=RiskLevel.HIGH,
                labels=labels,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self._policy_version,
            )
        if top.score >= _FLAG_THRESHOLD:
            return ModerationOutcome(
                decision=ModerationDecision.FLAG,
                risk_level=RiskLevel.MEDIUM,
                labels=labels,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self._policy_version,
                requires_warning=True,
            )
        return ModerationOutcome(
            decision=ModerationDecision.APPROVE,
            risk_level=RiskLevel.LOW,
            labels=labels,
            provider=self.provider_name,
            model_version=self.model_version,
            policy_version=self._policy_version,
        )
