"""Moderation bounded context: content-safety provider adapters.

Providers convert raw model/provider responses into the domain-level
:class:`~rmit_society.moderation.domain.ModerationOutcome`. Failures fail
closed (raised as :class:`~rmit_society.errors.ProviderError`) so workers can
mark content FAILED rather than unsafe-as-safe.
"""

from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.errors import ProviderError
from rmit_society.moderation.domain import LabelResult, ModerationOutcome
from rmit_society.shared.enums import ModerationCategory, ModerationDecision, RiskLevel

__all__ = [
    "LocalTextModerator",
    "ComprehendTextModerator",
    "RekognitionImageModerator",
    "resolve_outcome",
]

_REJECT_THRESHOLD = 0.85
_FLAG_THRESHOLD = 0.4


def resolve_outcome(
    *,
    labels: list[LabelResult],
    provider: str,
    model_version: str,
    policy_version: str,
) -> ModerationOutcome:
    """Map ordered labels to a fail-closed ModerationOutcome."""
    if not labels:
        return ModerationOutcome(
            decision=ModerationDecision.APPROVE,
            risk_level=RiskLevel.LOW,
            provider=provider,
            model_version=model_version,
            policy_version=policy_version,
        )
    top = labels[0]
    if top.score >= _REJECT_THRESHOLD:
        return ModerationOutcome(
            decision=ModerationDecision.REJECT,
            risk_level=RiskLevel.HIGH,
            labels=labels,
            provider=provider,
            model_version=model_version,
            policy_version=policy_version,
        )
    if top.score >= _FLAG_THRESHOLD:
        return ModerationOutcome(
            decision=ModerationDecision.FLAG,
            risk_level=RiskLevel.MEDIUM,
            labels=labels,
            provider=provider,
            model_version=model_version,
            policy_version=policy_version,
            requires_warning=True,
        )
    return ModerationOutcome(
        decision=ModerationDecision.APPROVE,
        risk_level=RiskLevel.LOW,
        labels=labels,
        provider=provider,
        model_version=model_version,
        policy_version=policy_version,
    )


# --------------------------------------------------------------------------- #
# Local deterministic text moderation (fixtures/tests only)
# --------------------------------------------------------------------------- #

_THRESHOLDS = {
    "flag_score": 0.4,
    "reject_score": 0.85,
}

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


# --------------------------------------------------------------------------- #
# Amazon Comprehend toxic-content text classification
# --------------------------------------------------------------------------- #

_LABEL_MAP: dict[str, ModerationCategory] = {
    "HATE_SPEECH": ModerationCategory.HATE,
    "HARASSMENT": ModerationCategory.HARASSMENT,
    "SEXUAL": ModerationCategory.SEXUAL,
    "VIOLENCE": ModerationCategory.VIOLENCE,
    "GRAPHIC": ModerationCategory.GRAPHIC,
    "PROFANITY": ModerationCategory.PROFANITY,
    "INSULT": ModerationCategory.HARASSMENT,
}


class ComprehendTextModerator:
    """Amazon Comprehend toxic-content classification."""

    provider_name = "aws-comprehend"
    model_version = "detect-toxic-content"

    def __init__(
        self, *, region: str | None = None, language: str = "en", policy_version: str = "1"
    ) -> None:
        del region
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
        return resolve_outcome(
            labels=labels,
            provider=self.provider_name,
            model_version=self.model_version,
            policy_version=self._policy_version,
        )


# --------------------------------------------------------------------------- #
# Amazon Rekognition content-safety image moderation
# --------------------------------------------------------------------------- #

_IMAGE_LABEL_MAP: dict[str, ModerationCategory] = {
    "Explicit Nudity": ModerationCategory.NUDITY,
    "Nudity": ModerationCategory.NUDITY,
    "Graphic Male Nudity": ModerationCategory.NUDITY,
    "Graphic Female Nudity": ModerationCategory.NUDITY,
    "Sexual Activity": ModerationCategory.SEXUAL,
    "Sexual Situations": ModerationCategory.SEXUAL,
    "Violence": ModerationCategory.VIOLENCE,
    "Weapon Violence": ModerationCategory.VIOLENCE,
    "Self Harm": ModerationCategory.VIOLENCE,
    "Hate Symbols": ModerationCategory.HATE,
    "Alcoholic Beverages": ModerationCategory.UNSUPPORTED,
}

_IMAGE_REJECT_THRESHOLD = 0.9
_IMAGE_FLAG_THRESHOLD = 0.5


class RekognitionImageModerator:
    """Amazon Rekognition content-safety labels (no facial/biometric analysis)."""

    provider_name = "aws-rekognition"
    model_version = "content-moderation"

    def __init__(
        self, *, region: str | None = None, bucket: str | None = None, policy_version: str = "1"
    ) -> None:
        del region
        self._client: Any = client("rekognition")
        self._bucket = bucket
        self._policy_version = policy_version

    def moderate_image(self, *, bucket: str, key: str) -> ModerationOutcome:
        try:
            response = self._client.detect_moderation_labels(
                Image={"S3Object": {"Bucket": bucket, "Name": key}},
                MinConfidence=50,
            )
        except Exception as error:
            raise ProviderError(f"Rekognition failed: {error}") from error

        labels: list[LabelResult] = []
        for item in response.get("ModerationLabels", []):
            category = _IMAGE_LABEL_MAP.get(item.get("Name", ""), ModerationCategory.GRAPHIC)
            score = float(item.get("Confidence", 0.0)) / 100.0
            if score > 0:
                labels.append(LabelResult(category=category, score=round(score, 4)))

        labels.sort(key=lambda label: label.score, reverse=True)
        if not labels:
            return ModerationOutcome(
                decision=ModerationDecision.APPROVE,
                risk_level=RiskLevel.LOW,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self._policy_version,
            )
        top = labels[0]
        if top.score >= _IMAGE_REJECT_THRESHOLD:
            return ModerationOutcome(
                decision=ModerationDecision.REJECT,
                risk_level=RiskLevel.HIGH,
                labels=labels,
                provider=self.provider_name,
                model_version=self.model_version,
                policy_version=self._policy_version,
            )
        if top.score >= _IMAGE_FLAG_THRESHOLD:
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
