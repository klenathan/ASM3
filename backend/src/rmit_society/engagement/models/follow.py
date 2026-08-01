from typing import Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class Follow(BaseModel):
    entity_type: Literal["FOLLOW"] = "FOLLOW"
    follower_user_id: str
    target_user_id: str
    created_at: str
    institution_id: str = INSTITUTION_ID
