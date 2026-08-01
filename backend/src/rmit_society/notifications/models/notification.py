from typing import Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class Notification(BaseModel):
    entity_type: Literal["NOTIFICATION"] = "NOTIFICATION"
    notification_id: str
    recipient_user_id: str
    type: str
    content_id: str | None = None
    actor_user_id: str | None = None
    read: bool = False
    created_at: str
    institution_id: str = INSTITUTION_ID
