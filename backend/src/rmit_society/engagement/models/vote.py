from typing import Literal

from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class Vote(BaseModel):
    entity_type: Literal["VOTE"] = "VOTE"
    content_id: str
    user_id: str
    value: Literal[1] = 1
    created_at: str
    institution_id: str = INSTITUTION_ID
