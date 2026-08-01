from __future__ import annotations

from rmit_society.domain.content import Post
from rmit_society.repositories.interfaces import Repository

FEED_RMIT = "RMIT"
FEED_SOCIETY = "SOCIETY"
FEED_AUTHOR = "AUTHOR"

_HOME_SOCIETY_ID = "rmit"


def publish_post(repo: Repository, post: Post) -> None:
    """Fan out feed projection records for approved/flagged posts."""
    repo.add_feed_entry(FEED_RMIT, "rmit", post.post_id, post.created_at)
    repo.add_feed_entry(FEED_AUTHOR, post.author_user_id, post.post_id, post.created_at)
    if post.society_id != _HOME_SOCIETY_ID:
        repo.add_feed_entry(FEED_SOCIETY, post.society_id, post.post_id, post.created_at)


def suppress_post(repo: Repository, post: Post) -> None:
    """Idempotently remove all feed projections for a post."""
    repo.remove_feed_entry(FEED_RMIT, "rmit", post.post_id)
    repo.remove_feed_entry(FEED_AUTHOR, post.author_user_id, post.post_id)
    if post.society_id != _HOME_SOCIETY_ID:
        repo.remove_feed_entry(FEED_SOCIETY, post.society_id, post.post_id)


def school_feed(repo: Repository) -> list[str]:
    return repo.list_feed(FEED_RMIT, "rmit")


def society_feed(repo: Repository, society_id: str) -> list[str]:
    return repo.list_feed(FEED_SOCIETY, society_id)


def author_feed(repo: Repository, author_user_id: str) -> list[str]:
    return repo.list_feed(FEED_AUTHOR, author_user_id)


def joined_feed(repo: Repository, user_id: str, *, include_home: bool = True) -> list[str]:
    seen: set[str] = set()
    if include_home:
        seen.update(school_feed(repo))
    for society_id in repo.list_joined_societies(user_id):
        seen.update(society_feed(repo, society_id))
    return _ordered(seen)


def following_feed(repo: Repository, user_id: str) -> list[str]:
    seen: set[str] = set()
    for target_user_id in repo.list_following(user_id):
        seen.update(author_feed(repo, target_user_id))
    return _ordered(seen)


def _ordered(content_ids: set[str]) -> list[str]:
    return list(content_ids)
