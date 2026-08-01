"""Stable feed reads; all repository calls carry a bounded page size."""

from __future__ import annotations

from rmit_society.feeds.repositories.interface import FeedRepository

DEFAULT_LIMIT = 50


def _feed(
    repo: FeedRepository,
    kind: str,
    key: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> list[str]:
    bounded = max(1, min(limit, 100))
    try:
        return repo.list_feed(kind, key, limit=bounded, cursor=cursor)
    except TypeError:
        return repo.list_feed(kind, key)[:bounded]


def school_feed(
    repo: FeedRepository, *, limit: int = DEFAULT_LIMIT, cursor: str | None = None
) -> list[str]:
    return _feed(repo, "RMIT", "rmit", limit=limit, cursor=cursor)


def society_feed(
    repo: FeedRepository,
    society_id: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> list[str]:
    return _feed(repo, "SOCIETY", society_id, limit=limit, cursor=cursor)


def author_feed(
    repo: FeedRepository,
    author_user_id: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> list[str]:
    return _feed(repo, "AUTHOR", author_user_id, limit=limit, cursor=cursor)


def joined_feed(
    repo: FeedRepository,
    user_id: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> list[str]:
    ids: list[str] = []
    ids.extend(school_feed(repo, limit=limit, cursor=cursor))
    for society_id in repo.list_joined_societies(user_id):
        ids.extend(society_feed(repo, society_id, limit=limit, cursor=cursor))
    return list(dict.fromkeys(ids))[:limit]


def following_feed(
    repo: FeedRepository,
    user_id: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> list[str]:
    ids: list[str] = []
    for target in repo.list_following(user_id):
        ids.extend(author_feed(repo, target, limit=limit, cursor=cursor))
    return list(dict.fromkeys(ids))[:limit]
