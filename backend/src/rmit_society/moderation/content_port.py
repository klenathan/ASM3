from typing import Protocol

from rmit_society.shared.enums import ContentState


class ContentModerationPort(Protocol):
    def transition_state(
        self,
        content_id: str,
        expected: ContentState,
        new_state: ContentState,
        **changes: object,
    ) -> bool: ...
