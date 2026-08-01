from rmit_society.moderation.providers import LocalTextModerator
from rmit_society.shared.enums import ModerationDecision, RiskLevel


def _moderate(text: str):
    return LocalTextModerator(policy_version="1").moderate_text(text, content_id="c1")


def test_safe_text_approved() -> None:
    outcome = _moderate("Just asking about the assignment due date, thanks!")
    assert outcome.decision is ModerationDecision.APPROVE
    assert outcome.risk_level is RiskLevel.LOW


def test_severe_text_rejected() -> None:
    outcome = _moderate("I will kill you.")
    assert outcome.decision is ModerationDecision.REJECT
    assert outcome.risk_level is RiskLevel.HIGH


def test_medium_text_flagged_with_warning() -> None:
    outcome = _moderate("This is really annoying harassment.")
    assert outcome.decision is ModerationDecision.FLAG
    assert outcome.requires_warning is True
    assert outcome.risk_level is RiskLevel.MEDIUM


def test_labels_are_normalized_categories() -> None:
    outcome = _moderate("You are a slur and I hate you.")
    assert any(label.category.value in ("hate", "harassment") for label in outcome.labels)
