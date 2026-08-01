from types import SimpleNamespace

from rmit_society.engagement.services.engagement import EngagementService


class Repo:
    def __init__(self) -> None:
        self.votes: set[tuple[str, str]] = set()
        self.count = 0

    def get_post(self, content_id: str) -> object | None:
        return SimpleNamespace(post_id=content_id)

    def get_comment(self, content_id: str) -> object | None:
        return None

    def get_user(self, user_id: str) -> object | None:
        return SimpleNamespace(user_id=user_id)

    def put_vote(self, vote: object) -> bool:
        key = (vote.content_id, vote.user_id)
        if key in self.votes:
            return False
        self.votes.add(key)
        return True

    def delete_vote(self, content_id: str, user_id: str) -> bool:
        key = (content_id, user_id)
        if key not in self.votes:
            return False
        self.votes.remove(key)
        return True

    def increment_counter(self, content_id: str, field: str, delta: int) -> None:
        self.count += delta

    def put_follow(self, follow: object) -> bool:
        return True

    def delete_follow(self, follower_user_id: str, target_user_id: str) -> None:
        pass

    def put_block(self, block: object) -> bool:
        return True

    def delete_block(self, blocker_user_id: str, target_user_id: str) -> None:
        pass


def test_duplicate_vote_and_unvote_do_not_drift_counter() -> None:
    repo = Repo()
    service = EngagementService(repo)

    service.vote(content_id="post-1", user_id="user-1")
    service.vote(content_id="post-1", user_id="user-1")
    service.unvote(content_id="post-1", user_id="user-1")
    service.unvote(content_id="post-1", user_id="user-1")

    assert repo.count == 0
