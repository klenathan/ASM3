from pydantic import BaseModel

from rmit_society.shared.constants import INSTITUTION_ID


class FeedEntry(BaseModel):
    feed_type: str
    feed_id: str
    content_id: str
    published_at: str
    institution_id: str = INSTITUTION_ID
