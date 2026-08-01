from typing import Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class Block(BaseModel):
    entity_type: Literal["BLOCK"] = "BLOCK"
    blocker_user_id: str
    target_user_id: str
    created_at: str
    institution_id: str = INSTITUTION_ID
