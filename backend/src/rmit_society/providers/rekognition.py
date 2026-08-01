from __future__ import annotations

from typing import Any

from rmit_society.aws import client
from rmit_society.domain.enums import ModerationCategory, ModerationDecision, RiskLevel
from rmit_society.domain.moderation import LabelResult, ModerationOutcome
from rmit_society.errors import ProviderError

_LABEL_MAP: dict[str, ModerationCategory] = {
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

_REJECT_THRESHOLD = 0.9
_FLAG_THRESHOLD = 0.5


class RekognitionImageModerator:
    """Amazon Rekognition content-safety labels (no facial/biometric analysis)."""

    provider_name = "aws-rekognition"
    model_version = "content-moderation"

    def __init__(
        self, *, region: str | None = None, bucket: str | None = None, policy_version: str = "1"
    ) -> None:
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
            category = _LABEL_MAP.get(item.get("Name", ""), ModerationCategory.GRAPHIC)
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
