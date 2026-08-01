from rmit_society.auth.claims import Claims, Role, UserStatus
from rmit_society.base import new_id, utc_now
from rmit_society.domain.content import ContentVersion, Post
from rmit_society.domain.enums import ContentState
from rmit_society.domain.societies import Society, SocietyMembership
from rmit_society.domain.users import User
from rmit_society.errors import AuthenticationError
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services.identity import create_user_profile, resolve_profile


def _user(repo: DynamoDBRepository, sub: str) -> User:
    user_id = new_id("u")
    user = User(
        user_id=user_id,
        cognito_sub=sub,
        handle=f"handle{user_id[:6]}",
        display_name="Tester",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    repo.put_user(user)
    repo.reserve_handle(user.handle, user_id)
    return user


def _society(repo: DynamoDBRepository, slug: str, owner_id: str) -> Society:
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
    repo.reserve_slug(slug, society_id)
    return society


def test_user_profile_and_handle_reservation(aws_resources) -> None:
    repo = DynamoDBRepository()
    user = _user(repo, "sub-1")
    assert repo.get_user(user.user_id).user_id == user.user_id
    assert repo.get_user_by_cognito_sub(user.cognito_sub).user_id == user.user_id
    assert repo.get_user_by_handle(user.handle).user_id == user.user_id
    # Handle reservation is unique.
    assert repo.reserve_handle(user.handle, "other") is False


def test_create_profile_is_idempotent_and_persists_major(aws_resources) -> None:
    repo = DynamoDBRepository()
    first = create_user_profile(
        repo,
        cognito_sub="sub-major",
        handle="s1234567",
        display_name="Alex",
        major="Engineering",
    )
    second = create_user_profile(
        repo,
        cognito_sub="sub-major",
        handle="s1234567",
        display_name="Ignored",
        major="Ignored",
    )
    assert second.user_id == first.user_id
    assert second.display_name == "Alex"
    assert second.major == "Engineering"
    assert second.handle == "s1234567"
    assert repo.get_user_by_cognito_sub("sub-major").user_id == first.user_id
    assert repo.get_user_by_handle("s1234567").user_id == first.user_id


def test_resolve_profile_rejects_unknown_and_mismatched_identity(aws_resources) -> None:
    repo = DynamoDBRepository()
    profile = create_user_profile(
        repo,
        cognito_sub="sub-profile",
        handle="s1234567",
        display_name="Alex",
        major="Science",
    )

    # No Cognito username claim and no profile -> reject (bootstrap is read-only).
    unknown = Claims(
        subject="no-such-sub",
        institution_id="rmit",
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
    )
    try:
        resolve_profile(repo, unknown)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass

    # Valid cognito username matching the stored handle resolves the profile.
    matching = Claims(
        subject="sub-profile",
        institution_id="rmit",
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
        cognito_username="s1234567@student.rmit.edu.au",
    )
    assert resolve_profile(repo, matching).user_id == profile.user_id

    # Cognito username that does not match the stored handle is rejected.
    mismatched = Claims(
        subject="sub-profile",
        institution_id="rmit",
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
        cognito_username="s9999999@student.rmit.edu.au",
    )
    try:
        resolve_profile(repo, mismatched)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass

    # An ineligible (non-RMIT) cognito username is rejected.
    ineligible = Claims(
        subject="sub-profile",
        institution_id="rmit",
        role=Role.STUDENT,
        status=UserStatus.ACTIVE,
        cognito_username="student@example.com",
    )
    try:
        resolve_profile(repo, ineligible)
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass


def test_society_slug_join_and_members(aws_resources) -> None:
    repo = DynamoDBRepository()
    owner = _user(repo, "owner")
    society = _society(repo, "sailing", owner.user_id)
    member = _user(repo, "member")
    membership = SocietyMembership(
        society_id=society.society_id, user_id=member.user_id, joined_at=utc_now()
    )
    assert repo.join(membership) is True
    assert repo.is_member(society.society_id, member.user_id) is True
    assert [m.user_id for m in repo.list_members(society.society_id)] == [
        member.user_id
    ]
    # Duplicate join is rejected.
    assert repo.join(membership) is False
    assert repo.get_society_by_slug("sailing").society_id == society.society_id
    assert repo.reserve_slug("sailing", "x") is False


def test_post_creation_conditional_transition_and_version(aws_resources) -> None:
    repo = DynamoDBRepository()
    author = _user(repo, "author")
    society = _society(repo, "music", author.user_id)
    now = utc_now()
    post = Post(
        post_id=new_id("p"),
        author_user_id=author.user_id,
        society_id=society.society_id,
        body="hello forum",
        state=ContentState.PENDING,
        version=1,
        created_at=now,
        updated_at=now,
    )
    repo.create_post(post)
    repo.save_version(
        ContentVersion(
            content_id=post.post_id,
            content_type="post",
            version=1,
            body="hello forum",
            state=ContentState.PENDING,
            created_at=now,
        )
    )
    # Conditional transition only succeeds from the expected state.
    assert repo.transition_state(post.post_id, "PENDING", "APPROVED") is True
    assert repo.get_post(post.post_id).state is ContentState.APPROVED
    assert (
        repo.transition_state(post.post_id, "PENDING", "REJECTED") is False
    )


def test_feed_entries_and_vote_uniqueness(aws_resources) -> None:
    repo = DynamoDBRepository()
    author = _user(repo, "author")
    society = _society(repo, "art", author.user_id)
    post_id = new_id("p")
    repo.create_post(
        Post(
            post_id=post_id,
            author_user_id=author.user_id,
            society_id=society.society_id,
            body="body",
            state=ContentState.APPROVED,
            version=1,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    repo.add_feed_entry("RMIT", "rmit", post_id, utc_now())
    assert repo.list_feed("RMIT", "rmit") == [post_id]


def test_report_deduplication(aws_resources) -> None:
    from rmit_society.domain.engagement import Report

    repo = DynamoDBRepository()
    reporter = _user(repo, "reporter")
    society = _society(repo, "film", reporter.user_id)
    post_id = new_id("p")
    repo.create_post(
        Post(
            post_id=post_id,
            author_user_id=reporter.user_id,
            society_id=society.society_id,
            body="body",
            state=ContentState.APPROVED,
            version=1,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    report1 = Report(
        report_id=new_id("rep"),
        content_id=post_id,
        reporter_user_id=reporter.user_id,
        reason="spam",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    assert repo.create_report(report1) is True
    report2 = Report(
        report_id=new_id("rep"),
        content_id=post_id,
        reporter_user_id=reporter.user_id,
        reason="spam",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    assert repo.create_report(report2) is False
