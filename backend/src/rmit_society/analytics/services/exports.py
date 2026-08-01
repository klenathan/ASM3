from rmit_society.analytics.models.events import SanitizedAnalyticsEvent


def sanitize_event(
    event_type: str, payload: dict[str, object], occurred_at: str
) -> SanitizedAnalyticsEvent:
    return SanitizedAnalyticsEvent(
        event=event_type,
        action=str(payload.get("state", "")).lower() or event_type,
        content_type=str(payload["content_type"]) if payload.get("content_type") else None,
        occurred_at=occurred_at,
    )
