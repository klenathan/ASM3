from datetime import UTC, datetime, timedelta

import pytest

from rmit_society.base import new_id, utc_now
from rmit_society.domain.content import Post, PostCreate
from rmit_society.domain.societies import Society, SocietyMembership
from rmit_society.domain.users import User
from rmit_society.errors import AuthorizationError, ValidationError_
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import feeds
from rmit_society.services.content import ContentService
from rmit_society.services.identity import create_user_profile


class QuietPublisher:
    def publish(self, *args: object, **kwargs: object) -> None:
        return None


def _make_user(repo: DynamoDBRepository, sub: str) -> User:
    return create_user_profile(
        repo,
        cognito_sub=sub,
        handle=f"s{abs(hash(sub)) % 10_000_000:07d}",
        display_name=sub,
        major="Engineering",
    )


def _make_society(repo: DynamoDBRepository, slug: str, owner_id: str) -> Society:
    society_id = new_id("s")
    society = Society(
        society_id=society_id,
        slug=slug,
        name=slug,
        owner_user_id=owner_id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.create_society(society)
    return society


def _join(repo: DynamoDBRepository, society_id: str, user_id: str) -> None:
    repo.join(SocietyMembership(society_id=society_id, user_id=user_id, joined_at=utc_now()))


def _approved_post(repo: DynamoDBRepository, author_id: str, society_id: str) -> Post:
    now = utc_now()
    post = Post(
        post_id=new_id("p"),
        author_user_id=author_id,
        society_id=society_id,
        body="approved body",
        state="APPROVED",
        version=1,
        created_at=now,
        updated_at=now,
    )
    repo.create_post(post)
    feeds.publish_post(repo, post)
    return post


def test_post_requires_society_membership(aws_resources) -> None:
    repo = DynamoDBRepository()
    service = ContentService(repo, QuietPublisher())
    owner = _make_user(repo, "owner")
    outsider = _make_user(repo, "outsider")
    society = _make_society(repo, "garden", owner.user_id)
    _join(repo, society.society_id, owner.user_id)

    with pytest.raises(AuthorizationError):
        service.create_post(
            author_user_id=outsider.user_id,
            society_id=society.society_id,
            society_slug=society.slug,
            payload=PostCreate(body="not a member"),
        )

    post = service.create_post(
        author_user_id=owner.user_id,
        society_id=society.society_id,
        society_slug=society.slug,
        payload=PostCreate(body="member can post"),
    )
    assert post.post_id


def test_pending_post_not_visible_in_feeds(aws_resources) -> None:
    repo = DynamoDBRepository()
    service = ContentService(repo, QuietPublisher())
    author = _make_user(repo, "author")
    society = _make_society(repo, "study", author.user_id)
    _join(repo, society.society_id, author.user_id)
    author_alias = _make_user(repo, "author2")
    _join(repo, society.society_id, author_alias.user_id)

    post = service.create_post(
        author_user_id=author.user_id,
        society_id=society.society_id,
        society_slug=society.slug,
        payload=PostCreate(body="pending post"),
    )
    assert post.post_id not in feeds.society_feed(repo, society.society_id)
    assert post.post_id not in feeds.school_feed(repo)


def test_approved_post_enters_feeds_and_delete_suppresses(aws_resources) -> None:
    repo = DynamoDBRepository()
    service = ContentService(repo, QuietPublisher())
    author = _make_user(repo, "author3")
    society = _make_society(repo, "study3", author.user_id)
    _join(repo, society.society_id, author.user_id)

    post = _approved_post(repo, author.user_id, society.society_id)
    assert post.post_id in feeds.society_feed(repo, society.society_id)
    assert post.post_id in feeds.school_feed(repo)

    service.delete_post(post_id=post.post_id, user_id=author.user_id)
    assert post.post_id not in feeds.society_feed(repo, society.society_id)
    assert post.post_id not in feeds.school_feed(repo)


def test_edit_window_blocks_late_edit(aws_resources) -> None:
    repo = DynamoDBRepository()
    service = ContentService(repo, QuietPublisher())
    author = _make_user(repo, "author5")
    society = _make_society(repo, "study5", author.user_id)
    _join(repo, society.society_id, author.user_id)
    old_time = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    post_id = new_id("p")
    post = Post(
        post_id=post_id,
        author_user_id=author.user_id,
        society_id=society.society_id,
        body="old",
        state="APPROVED",
        version=1,
        created_at=old_time,
        updated_at=old_time,
    )
    repo.create_post(post)
    with pytest.raises(ValidationError_):
        service.edit_post(post_id=post_id, user_id=author.user_id, body="edited")


def test_delete_requires_author(aws_resources) -> None:
    repo = DynamoDBRepository()
    service = ContentService(repo, QuietPublisher())
    author = _make_user(repo, "author6")
    other = _make_user(repo, "author7")
    society = _make_society(repo, "study6", author.user_id)
    _join(repo, society.society_id, author.user_id)
    post = _approved_post(repo, author.user_id, society.society_id)
    with pytest.raises(AuthorizationError):
        service.delete_post(post_id=post.post_id, user_id=other.user_id)
