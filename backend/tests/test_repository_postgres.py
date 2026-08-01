"""PostgreSQL repository tests.

Unlike the legacy DynamoDB tests (which need moto), the Postgres repository
runs against an in-memory SQLite database. SQLAlchemy executes the same
``ON CONFLICT`` statements on both SQLite and Postgres, so these tests verify
the repository's DRY data-access behavior without live AWS or paid services.
"""

from __future__ import annotations

import pytest
from sqlalchemy import StaticPool, create_engine

from rmit_society.base import new_id, utc_now
from rmit_society.domain.content import ContentVersion, Post
from rmit_society.domain.enums import ContentState
from rmit_society.domain.events import AuditEvent, Upload
from rmit_society.domain.societies import Society, SocietyMembership
from rmit_society.domain.users import User
from rmit_society.repositories.postgres import PostgresRepository


@pytest.fixture
def repo() -> PostgresRepository:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return PostgresRepository("sqlite://", engine=engine)


def _user(repo: PostgresRepository, sub: str, handle: str) -> User:
    user = User(
        user_id=new_id("u"),
        cognito_sub=sub,
        handle=handle,
        display_name="Tester",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.put_user(user)
    repo.reserve_handle(handle, user.user_id)
    return user


def _society(repo: PostgresRepository, slug: str, owner_id: str) -> Society:
    society = Society(
        society_id=new_id("s"),
        slug=slug,
        name=slug,
        owner_user_id=owner_id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.create_society(society)
    repo.reserve_slug(slug, society.society_id)
    return society


def _post(
    repo: PostgresRepository, author_id: str, society_id: str, state=ContentState.PENDING
) -> Post:
    now = utc_now()
    post = Post(
        post_id=new_id("p"),
        author_user_id=author_id,
        society_id=society_id,
        body="hello forum",
        state=state,
        version=1,
        created_at=now,
        updated_at=now,
    )
    repo.create_post(post)
    return post


# ---------------------------------------------------------------------- users


def test_put_and_get_user(repo: PostgresRepository) -> None:
    user = _user(repo, "sub-1", "alice")
    got = repo.get_user(user.user_id)
    assert got is not None
    assert got.user_id == user.user_id
    assert got.handle == "alice"


def test_get_user_by_handle_is_case_insensitive(repo: PostgresRepository) -> None:
    user = _user(repo, "sub-2", "BoB")
    assert repo.get_user_by_handle("bob").user_id == user.user_id


def test_get_user_by_cognito_sub(repo: PostgresRepository) -> None:
    user = _user(repo, "sub-3", "carol")
    assert repo.get_user_by_cognito_sub("sub-3").user_id == user.user_id


def test_update_user(repo: PostgresRepository) -> None:
    user = _user(repo, "sub-4", "dave")
    repo.update_user(user.user_id, display_name="David")
    assert repo.get_user(user.user_id).display_name == "David"


def test_reserve_handle_is_exclusive(repo: PostgresRepository) -> None:
    assert repo.reserve_handle("rock", "u1") is True
    assert repo.reserve_handle("ROCK", "u2") is False


# ----------------------------------------------------------------- societies


def test_create_and_get_society(repo: PostgresRepository) -> None:
    owner = _user(repo, "sub-5", "eve")
    society = _society(repo, "coding", owner.user_id)
    got = repo.get_society(society.society_id)
    assert got is not None
    assert got.slug == "coding"


def test_society_slug_case_insensitive(repo: PostgresRepository) -> None:
    owner = _user(repo, "sub-6", "frank")
    society = _society(repo, "Music", owner.user_id)
    assert repo.get_society_by_slug("music").society_id == society.society_id


def test_membership_join_leave_and_roles(repo: PostgresRepository) -> None:
    owner = _user(repo, "sub-7", "grace")
    member = _user(repo, "sub-8", "heidi")
    society = _society(repo, "climbing", owner.user_id)

    assert repo.join(
        SocietyMembership(
            society_id=society.society_id,
            user_id=member.user_id,
            joined_at=utc_now(),
        )
    ) is True
    assert repo.join(
        SocietyMembership(
            society_id=society.society_id,
            user_id=member.user_id,
            joined_at=utc_now(),
        )
    ) is False
    assert repo.is_member(society.society_id, member.user_id) is True
    assert repo.is_moderator(society.society_id, member.user_id) is False

    assert repo.set_moderator(society.society_id, member.user_id, True) is True
    assert repo.is_moderator(society.society_id, member.user_id) is True

    assert [m.user_id for m in repo.list_members(society.society_id)] == [member.user_id]
    assert [m.society_id for m in repo.list_joined(member.user_id)] == [society.society_id]

    repo.leave(society.society_id, member.user_id)
    assert repo.is_member(society.society_id, member.user_id) is False


def test_increment_members(repo: PostgresRepository) -> None:
    owner = _user(repo, "sub-9", "ivan")
    society = _society(repo, "dance", owner.user_id)
    repo.increment_members(society.society_id, 1)
    assert repo.get_society(society.society_id).member_count == 1


# ------------------------------------------------------------------ content


def test_post_lifecycle_and_conditional_transition(repo: PostgresRepository) -> None:
    author = _user(repo, "sub-10", "judy")
    society = _society(repo, "photo", author.user_id)
    post = _post(repo, author.user_id, society.society_id)

    repo.save_version(
        ContentVersion(
            content_id=post.post_id,
            content_type="post",
            version=1,
            body=post.body,
            state=ContentState.PENDING,
            created_at=utc_now(),
        )
    )
    assert repo.transition_state(post.post_id, "PENDING", "APPROVED") is True
    assert repo.get_post(post.post_id).state is ContentState.APPROVED
    assert repo.transition_state(post.post_id, "PENDING", "REJECTED") is False


def test_post_counter(repo: PostgresRepository) -> None:
    author = _user(repo, "sub-11", "kyle")
    society = _society(repo, "garden", author.user_id)
    post = _post(repo, author.user_id, society.society_id, state=ContentState.APPROVED)
    repo.increment_counter(post.post_id, "reply_count", 1)
    assert repo.get_post(post.post_id).reply_count == 1


def test_pinned_posts(repo: PostgresRepository) -> None:
    author = _user(repo, "sub-12", "liam")
    society = _society(repo, "books", author.user_id)
    post = _post(repo, author.user_id, society.society_id, state=ContentState.APPROVED)
    repo.update_post(post.post_id, pinned=True)
    pinned = repo.get_post_by_society_pinned(society.society_id)
    assert [p.post_id for p in pinned] == [post.post_id]


# --------------------------------------------------------------- engagement


def test_feed_entries_and_votes(repo: PostgresRepository) -> None:
    from rmit_society.domain.engagement import Vote

    author = _user(repo, "sub-13", "mia")
    society = _society(repo, "chess", author.user_id)
    post = _post(repo, author.user_id, society.society_id, state=ContentState.APPROVED)

    repo.add_feed_entry("RMIT", "rmit", post.post_id, utc_now())
    assert repo.list_feed("RMIT", "rmit") == [post.post_id]
    assert repo.list_joined_societies(author.user_id) == []
    repo.join(
        SocietyMembership(
            society_id=society.society_id,
            user_id=author.user_id,
            joined_at=utc_now(),
        )
    )
    assert repo.list_joined_societies(author.user_id) == [society.society_id]

    vote = Vote(content_id=post.post_id, user_id=author.user_id, value=1, created_at=utc_now())
    assert repo.put_vote(vote) is True
    assert repo.put_vote(vote) is False
    repo.delete_vote(post.post_id, author.user_id)


def test_follow_and_block(repo: PostgresRepository) -> None:
    from rmit_society.domain.engagement import Block, Follow

    a = _user(repo, "sub-14", "nina")
    b = _user(repo, "sub-15", "oscar")
    assert (
        repo.put_follow(
            Follow(
                follower_user_id=a.user_id,
                target_user_id=b.user_id,
                created_at=utc_now(),
            )
        )
        is True
    )
    assert repo.list_following(a.user_id) == [b.user_id]
    assert (
        repo.put_follow(
            Follow(
                follower_user_id=a.user_id,
                target_user_id=b.user_id,
                created_at=utc_now(),
            )
        )
        is False
    )
    repo.delete_follow(a.user_id, b.user_id)
    assert repo.list_following(a.user_id) == []

    assert (
        repo.put_block(
            Block(
                blocker_user_id=a.user_id,
                target_user_id=b.user_id,
                created_at=utc_now(),
            )
        )
        is True
    )
    assert (
        repo.put_block(
            Block(
                blocker_user_id=a.user_id,
                target_user_id=b.user_id,
                created_at=utc_now(),
            )
        )
        is False
    )
    repo.delete_block(a.user_id, b.user_id)


def test_report_deduplication(repo: PostgresRepository) -> None:
    from rmit_society.domain.engagement import Report

    a = _user(repo, "sub-16", "pam")
    s = _society(repo, "painting", a.user_id)
    post = _post(repo, a.user_id, s.society_id)
    report = Report(
        report_id=new_id("rep"),
        content_id=post.post_id,
        reporter_user_id=a.user_id,
        reason="spam",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    assert repo.create_report(report) is True
    assert repo.create_report(
        Report(
            report_id=new_id("rep"),
            content_id=post.post_id,
            reporter_user_id=a.user_id,
            reason="spam",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    ) is False
    assert [r.report_id for r in repo.list_open_reports()] == [report.report_id]
    repo.resolve_report(report.report_id, "RESOLVED")
    assert repo.list_open_reports() == []


def test_notifications(repo: PostgresRepository) -> None:
    from rmit_society.domain.engagement import Notification

    a = _user(repo, "sub-17", "quincy")
    repo.create_notification(
        Notification(
            notification_id=new_id("n"),
            recipient_user_id=a.user_id,
            type="reply",
            created_at=utc_now(),
        )
    )
    notes = repo.list_notifications(a.user_id)
    assert len(notes) == 1
    assert notes[0].read is False
    repo.mark_notification_read(notes[0].notification_id, a.user_id)
    assert repo.list_notifications(a.user_id)[0].read is True


# --------------------------------------------------------------- moderation


def test_moderation_jobs_and_queue(repo: PostgresRepository) -> None:
    from rmit_society.domain.moderation import ModerationJob

    a = _user(repo, "sub-18", "rachel")
    s = _society(repo, "robotics", a.user_id)
    post = _post(repo, a.user_id, s.society_id, state=ContentState.PENDING)
    repo.create_job(
        ModerationJob(
            content_id=post.post_id,
            version=1,
            provider="test",
            state="PENDING",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    job = repo.get_job(post.post_id)
    assert job is not None and job.provider == "test"
    repo.update_job_state(post.post_id, "COMPLETED", "APPROVE", 0)
    assert repo.get_job(post.post_id).state == "COMPLETED"
    assert post.post_id in repo.list_queue("PENDING")


def test_appeals_and_audit(repo: PostgresRepository) -> None:
    from rmit_society.domain.moderation import Appeal

    a = _user(repo, "sub-19", "sam")
    s = _society(repo, "sailing", a.user_id)
    post = _post(repo, a.user_id, s.society_id, state=ContentState.REJECTED)
    appeal = Appeal(
        appeal_id=new_id("ap"),
        content_id=post.post_id,
        content_type="post",
        appellant_user_id=a.user_id,
        state="OPEN",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    assert repo.create_appeal(appeal) is True
    assert repo.create_appeal(appeal) is False
    assert [x.appeal_id for x in repo.list_appeals("OPEN")] == [appeal.appeal_id]
    repo.update_appeal(appeal.appeal_id, state="UPHELD")
    assert repo.get_appeal(appeal.appeal_id).state == "UPHELD"

    repo2 = repo
    repo2.append_audit(
        AuditEvent(
            event_id=new_id("ev"),
            target_type="post",
            target_id=post.post_id,
            actor_user_id=a.user_id,
            action="REJECT",
            before={},
            after={"state": "REJECTED"},
            created_at=utc_now(),
        )
    )
    events = repo2.list_audit("post", post.post_id)
    assert len(events) == 1
    assert events[0].after == {"state": "REJECTED"}


# ------------------------------------------------------------------- uploads


def test_upload_lifecycle(repo: PostgresRepository) -> None:
    a = _user(repo, "sub-20", "tom")
    upload = Upload(
        upload_id=new_id("up"),
        owner_user_id=a.user_id,
        society_id="s1",
        declared_content_type="image/png",
        declared_size=100,
        quarantine_key="q/abc",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.create_upload(upload)
    assert repo.get_upload(upload.upload_id).state == "PENDING"
    repo.update_upload(upload.upload_id, state="APPROVED", media_id="m1")
    got = repo.get_upload(upload.upload_id)
    assert got.state == "APPROVED" and got.media_id == "m1"


# -------------------------------------------------------------- idempotency


def test_idempotency_claim(repo: PostgresRepository) -> None:
    assert repo.claim("key-1", {"ok": True}) is None
    assert repo.claim("key-1", {"ok": False}) == {"ok": True}
    assert repo.get("key-1") == {"ok": True}
