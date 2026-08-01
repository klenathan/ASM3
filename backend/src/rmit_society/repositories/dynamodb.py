from __future__ import annotations

from typing import Any, cast

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from rmit_society.aws import client, resource
from rmit_society.base import utc_now
from rmit_society.config import get_settings
from rmit_society.domain.content import Comment, ContentVersion, Post
from rmit_society.domain.engagement import Block, Follow, Notification, Report, Vote
from rmit_society.domain.events import AuditEvent, Upload
from rmit_society.domain.moderation import Appeal, ModerationDecisionRecord, ModerationJob
from rmit_society.domain.societies import Society, SocietyMembership
from rmit_society.domain.users import User

CONDITIONAL_CHECK_FAILED = "ConditionalCheckFailedException"


class DynamoDBRepository:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._table = resource("dynamodb").Table(self._settings.table_name)
        self._client: Any = client("dynamodb")

    # ------------------------------------------------------------------ users
    def get_user(self, user_id: str) -> User | None:
        item = self._get(f"USER#{user_id}", "PROFILE")
        return User.model_validate(item) if item else None

    def get_user_by_cognito_sub(self, cognito_sub: str) -> User | None:
        link = self._get(f"COGNITO#{cognito_sub}", "USER")
        user_id = link.get("user_id") if link else None
        return self.get_user(str(user_id)) if user_id else None

    def link_cognito_sub(self, cognito_sub: str, user_id: str) -> None:
        self._table.put_item(
            Item={
                "PK": f"COGNITO#{cognito_sub}",
                "SK": "USER",
                "entity_type": "COGNITO_USER_LINK",
                "cognito_sub": cognito_sub,
                "user_id": user_id,
            }
        )

    def get_user_by_handle(self, handle: str) -> User | None:
        item = self._query_one(
            "gsi_handle",
            Key("gsi_handle_pk").eq(f"HANDLE#{handle.lower()}"),
        )
        return User.model_validate(item) if item else None

    def put_user(self, user: User) -> None:
        self._table.put_item(
            Item=self._item(
                user,
                pk=f"USER#{user.user_id}",
                sk="PROFILE",
                extra={
                    "gsi_handle_pk": f"HANDLE#{user.handle.lower()}",
                    "gsi_handle_sk": "PROFILE",
                },
            )
        )
        self.link_cognito_sub(user.cognito_sub, user.user_id)

    def update_user(self, user_id: str, **changes: object) -> None:
        self._update(f"USER#{user_id}", "PROFILE", **changes)

    def reserve_handle(self, handle: str, user_id: str) -> bool:
        return self._conditional_put(
            {
                "PK": f"HANDLE#{handle.lower()}",
                "SK": "RESERVED",
                "handle": handle,
                "user_id": user_id,
            },
            "attribute_not_exists(PK)",
        )

    # -------------------------------------------------------------- societies
    def create_society(self, society: Society) -> None:
        self._table.put_item(
            Item=self._item(
                society,
                pk=f"SOCIETY#{society.society_id}",
                sk="PROFILE",
                extra={"gsi_slug_pk": f"SLUG#{society.slug.lower()}", "gsi_slug_sk": "PROFILE"},
            )
        )

    def get_society(self, society_id: str) -> Society | None:
        item = self._get(f"SOCIETY#{society_id}", "PROFILE")
        return Society.model_validate(item) if item else None

    def get_society_by_slug(self, slug: str) -> Society | None:
        item = self._query_one("gsi_slug", Key("gsi_slug_pk").eq(f"SLUG#{slug.lower()}"))
        return Society.model_validate(item) if item else None

    def update_society(self, society_id: str, **changes: object) -> None:
        self._update(f"SOCIETY#{society_id}", "PROFILE", **changes)

    def list_societies(self) -> list[Society]:
        items = self._scan(Attr("entity_type").eq("SOCIETY"))
        return [Society.model_validate(item) for item in items]

    def reserve_slug(self, slug: str, society_id: str) -> bool:
        return self._conditional_put(
            {
                "PK": f"SLUG#{slug.lower()}",
                "SK": "RESERVED",
                "slug": slug,
                "society_id": society_id,
            },
            "attribute_not_exists(PK)",
        )

    def join(self, membership: SocietyMembership) -> bool:
        ok = self._conditional_put(
            self._item(
                membership,
                pk=f"SOCIETY#{membership.society_id}",
                sk=f"MEMBER#{membership.user_id}",
                extra={
                    "gsi_user_society_pk": membership.user_id,
                    "gsi_user_society_sk": membership.joined_at,
                },
            ),
            "attribute_not_exists(PK)",
        )
        return ok

    def leave(self, society_id: str, user_id: str) -> None:
        self._table.delete_item(Key={"PK": f"SOCIETY#{society_id}", "SK": f"MEMBER#{user_id}"})

    def is_member(self, society_id: str, user_id: str) -> bool:
        return bool(self._get(f"SOCIETY#{society_id}", f"MEMBER#{user_id}"))

    def is_moderator(self, society_id: str, user_id: str) -> bool:
        item = self._get(f"SOCIETY#{society_id}", f"MEMBER#{user_id}")
        return bool(item and item.get("is_moderator"))

    def list_members(self, society_id: str) -> list[SocietyMembership]:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"SOCIETY#{society_id}")
            & Key("SK").begins_with("MEMBER#"),
        )
        return [SocietyMembership.model_validate(item) for item in response.get("Items", [])]

    def list_joined(self, user_id: str) -> list[SocietyMembership]:
        response = self._table.query(
            IndexName="gsi_user_society",
            KeyConditionExpression=Key("gsi_user_society_pk").eq(user_id),
        )
        return [SocietyMembership.model_validate(item) for item in response.get("Items", [])]

    def set_moderator(self, society_id: str, user_id: str, is_moderator: bool) -> bool:
        item = self._get(f"SOCIETY#{society_id}", f"MEMBER#{user_id}")
        if not item:
            return False
        self._update(f"SOCIETY#{society_id}", f"MEMBER#{user_id}", is_moderator=is_moderator)
        return True

    def increment_members(self, society_id: str, delta: int) -> None:
        self._add(f"SOCIETY#{society_id}", "PROFILE", "member_count", delta)

    # --------------------------------------------------------------- content
    def _locate_content(self, content_id: str) -> tuple[str, str] | None:
        item = self._query_one("gsi_content", Key("gsi_content_pk").eq(f"CONTENT#{content_id}"))
        if not item:
            return None
        return str(item["PK"]), str(item["SK"])

    def create_post(self, post: Post) -> None:
        extra = self._content_extra(post.post_id, post.state, post.created_at)
        extra["gsi_society_pin_pk"] = post.society_id
        extra["gsi_society_pin_sk"] = post.created_at
        self._table.put_item(
            Item=self._item(
                post,
                pk=f"POST#{post.post_id}",
                sk="METADATA",
                extra=extra,
            )
        )

    def get_post(self, post_id: str) -> Post | None:
        item = self._get(f"POST#{post_id}", "METADATA")
        return Post.model_validate(item) if item else None

    def update_post(self, post_id: str, **changes: object) -> None:
        self._update(f"POST#{post_id}", "METADATA", **changes)

    def get_post_by_society_pinned(self, society_id: str) -> list[Post]:
        response = self._table.query(
            IndexName="gsi_society_pin",
            KeyConditionExpression=Key("gsi_society_pin_pk").eq(society_id),
        )
        items = sorted(
            response.get("Items", []), key=lambda i: str(i.get("created_at", "")), reverse=True
        )
        return [Post.model_validate(item) for item in items if item.get("pinned")]

    def create_comment(self, comment: Comment) -> None:
        self._table.put_item(
            Item=self._item(
                comment,
                pk=f"POST#{comment.post_id}",
                sk=f"COMMENT#{comment.path}#{comment.comment_id}",
                extra=self._content_extra(comment.comment_id, comment.state, comment.created_at),
            )
        )

    def get_comment(self, comment_id: str) -> Comment | None:
        located = self._locate_content(comment_id)
        if not located:
            return None
        item = self._get(*located)
        return Comment.model_validate(item) if item else None

    def update_comment(self, comment_id: str, **changes: object) -> None:
        located = self._locate_content(comment_id)
        if located:
            pk, sk = located
            self._update(pk, sk, **changes)

    def list_comments(self, post_id: str) -> list[Comment]:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"POST#{post_id}")
            & Key("SK").begins_with("COMMENT#"),
        )
        return [Comment.model_validate(item) for item in response.get("Items", [])]

    def save_version(self, version: ContentVersion) -> None:
        self._table.put_item(
            Item=self._item(
                version, pk=f"CONTENT#{version.content_id}", sk=f"VERSION#{version.version}"
            )
        )

    def transition_state(
        self, content_id: str, expected: str, new_state: str, **changes: object
    ) -> bool:
        located = self._locate_content(content_id)
        if not located:
            return False
        pk, sk = located
        try:
            self._client.update_item(
                TableName=self._settings.table_name,
                Key={"PK": {"S": pk}, "SK": {"S": sk}},
                UpdateExpression="SET #state = :new, updated_at = :now",
                ConditionExpression="#state = :expected",
                ExpressionAttributeNames={"#state": "state"},
                ExpressionAttributeValues={
                    ":new": {"S": new_state},
                    ":expected": {"S": expected},
                    ":now": {"S": utc_now()},
                },
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == CONDITIONAL_CHECK_FAILED:
                return False
            raise
        self._update_mod_queue(pk, sk, new_state)
        if changes:
            self._update(pk, sk, **changes)
        return True

    def increment_counter(self, content_id: str, field: str, delta: int) -> None:
        located = self._locate_content(content_id)
        if located:
            self._add(*located, field, delta)

    # ------------------------------------------------------------ engagement
    def put_vote(self, vote: Vote) -> bool:
        return self._conditional_put(
            self._item(vote, pk=f"CONTENT#{vote.content_id}", sk=f"VOTE#{vote.user_id}"),
            "attribute_not_exists(PK)",
        )

    def delete_vote(self, content_id: str, user_id: str) -> None:
        self._table.delete_item(Key={"PK": f"CONTENT#{content_id}", "SK": f"VOTE#{user_id}"})

    def put_follow(self, follow: Follow) -> bool:
        return self._conditional_put(
            self._item(
                follow, pk=f"USER#{follow.follower_user_id}", sk=f"FOLLOW#{follow.target_user_id}"
            ),
            "attribute_not_exists(PK)",
        )

    def delete_follow(self, follower_user_id: str, target_user_id: str) -> None:
        self._table.delete_item(
            Key={"PK": f"USER#{follower_user_id}", "SK": f"FOLLOW#{target_user_id}"}
        )

    def put_block(self, block: Block) -> bool:
        return self._conditional_put(
            self._item(
                block, pk=f"USER#{block.blocker_user_id}", sk=f"BLOCK#{block.target_user_id}"
            ),
            "attribute_not_exists(PK)",
        )

    def delete_block(self, blocker_user_id: str, target_user_id: str) -> None:
        self._table.delete_item(
            Key={"PK": f"USER#{blocker_user_id}", "SK": f"BLOCK#{target_user_id}"}
        )

    def create_report(self, report: Report) -> bool:
        guard_ok = self._conditional_put(
            {
                "PK": f"REPORTGUARD#{report.content_id}",
                "SK": f"REPORT#{report.reporter_user_id}",
                "report_id": report.report_id,
                "created_at": report.created_at,
            },
            "attribute_not_exists(PK)",
        )
        if not guard_ok:
            return False
        item = self._item(
            report,
            pk=f"REPORT#{report.report_id}",
            sk="METADATA",
            extra={
                "gsi_report_pk": f"REPORTQUEUE#{report.state}",
                "gsi_report_sk": f"{report.created_at}#{report.report_id}",
            },
        )
        self._table.put_item(Item=item)
        return True

    def list_open_reports(self, state: str = "OPEN") -> list[Report]:
        response = self._table.query(
            IndexName="gsi_report",
            KeyConditionExpression=Key("gsi_report_pk").eq(f"REPORTQUEUE#{state}"),
        )
        return [Report.model_validate(item) for item in response.get("Items", [])]

    def resolve_report(self, report_id: str, state: str) -> None:
        self._update(
            f"REPORT#{report_id}",
            "METADATA",
            state=state,
            gsi_report_pk=f"REPORTQUEUE#{state}",
            updated_at=utc_now(),
        )

    def create_notification(self, notification: Notification) -> None:
        self._table.put_item(
            Item=self._item(
                notification,
                pk=f"USER#{notification.recipient_user_id}",
                sk=f"NOTIFICATION#{notification.created_at}#{notification.notification_id}",
            )
        )

    def list_notifications(self, user_id: str) -> list[Notification]:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
            & Key("SK").begins_with("NOTIFICATION#"),
            ScanIndexForward=False,
        )
        return [Notification.model_validate(item) for item in response.get("Items", [])]

    def mark_notification_read(self, notification_id: str, user_id: str) -> None:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
            & Key("SK").begins_with("NOTIFICATION#"),
        )
        for item in response.get("Items", []):
            if item.get("notification_id") == notification_id:
                self._update(f"USER#{user_id}", str(item["SK"]), read=True)
                return

    # ----------------------------------------------------------------- feeds
    def add_feed_entry(
        self, feed_type: str, feed_id: str, content_id: str, published_at: str
    ) -> None:
        self._table.put_item(
            Item={
                "PK": f"FEED#{feed_type}:{feed_id}",
                "SK": f"{published_at}#{content_id}",
                "entity_type": "FEED_ENTRY",
                "feed_type": feed_type,
                "feed_id": feed_id,
                "content_id": content_id,
                "published_at": published_at,
                "institution_id": "rmit",
                "created_at": utc_now(),
            }
        )

    def remove_feed_entry(self, feed_type: str, feed_id: str, content_id: str) -> None:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"FEED#{feed_type}:{feed_id}")
        )
        for item in response.get("Items", []):
            if item.get("content_id") == content_id:
                self._table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})

    def list_feed(self, feed_type: str, feed_id: str) -> list[str]:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"FEED#{feed_type}:{feed_id}"),
            ScanIndexForward=False,
        )
        return [str(item["content_id"]) for item in response.get("Items", [])]

    def list_joined_societies(self, user_id: str) -> list[str]:
        return [m.society_id for m in self.list_joined(user_id)]

    def list_following(self, user_id: str) -> list[str]:
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
            & Key("SK").begins_with("FOLLOW#"),
        )
        return [str(item["SK"]).removeprefix("FOLLOW#") for item in response.get("Items", [])]

    # ------------------------------------------------------------ moderation
    def create_job(self, job: ModerationJob) -> None:
        self._table.put_item(Item=self._item(job, pk=f"MODERATION#{job.content_id}", sk="JOB"))

    def get_job(self, content_id: str) -> ModerationJob | None:
        item = self._get(f"MODERATION#{content_id}", "JOB")
        return ModerationJob.model_validate(item) if item else None

    def update_job_state(self, content_id: str, state: str, decision: str, retries: int) -> None:
        self._update(
            f"MODERATION#{content_id}",
            "JOB",
            state=state,
            decision=decision,
            retries=retries,
            updated_at=utc_now(),
        )

    def record_decision(self, decision: ModerationDecisionRecord) -> None:
        self._table.put_item(
            Item=self._item(
                decision,
                pk=f"MODERATION#{decision.content_id}",
                sk=f"DECISION#{decision.created_at}#{decision.version}",
            )
        )

    def list_queue(self, state: str) -> list[str]:
        response = self._table.query(
            IndexName="gsi_modqueue",
            KeyConditionExpression=Key("gsi_mod_pk").eq(f"MODQUEUE#{state}"),
        )
        return [
            str(item["content_id"]) for item in response.get("Items", []) if "content_id" in item
        ]

    def create_appeal(self, appeal: Appeal) -> bool:
        return self._conditional_put(
            self._item(
                appeal,
                pk=f"APPEAL#{appeal.appeal_id}",
                sk="METADATA",
                extra={
                    "gsi_appeal_pk": f"APPEALQUEUE#{appeal.state}",
                    "gsi_appeal_sk": f"{appeal.created_at}#{appeal.appeal_id}",
                },
            ),
            "attribute_not_exists(PK)",
        )

    def get_appeal(self, appeal_id: str) -> Appeal | None:
        item = self._get(f"APPEAL#{appeal_id}", "METADATA")
        return Appeal.model_validate(item) if item else None

    def list_appeals(self, state: str) -> list[Appeal]:
        response = self._table.query(
            IndexName="gsi_appeal",
            KeyConditionExpression=Key("gsi_appeal_pk").eq(f"APPEALQUEUE#{state}"),
        )
        return [Appeal.model_validate(item) for item in response.get("Items", [])]

    def update_appeal(self, appeal_id: str, **changes: object) -> None:
        self._update(f"APPEAL#{appeal_id}", "METADATA", **changes)

    def append_audit(self, event: AuditEvent) -> None:
        self._table.put_item(
            Item=self._item(
                event, pk=f"AUDIT#{event.target_id}", sk=f"{event.created_at}#{event.event_id}"
            )
        )

    def list_audit(self, target_type: str, target_id: str) -> list[AuditEvent]:
        del target_type
        response = self._table.query(
            KeyConditionExpression=Key("PK").eq(f"AUDIT#{target_id}"),
            ScanIndexForward=False,
        )
        return [AuditEvent.model_validate(item) for item in response.get("Items", [])]

    # ---------------------------------------------------------------- upload
    def create_upload(self, upload: Upload) -> None:
        self._table.put_item(
            Item=self._item(upload, pk=f"UPLOAD#{upload.upload_id}", sk="METADATA")
        )

    def get_upload(self, upload_id: str) -> Upload | None:
        item = self._get(f"UPLOAD#{upload_id}", "METADATA")
        return Upload.model_validate(item) if item else None

    def update_upload(self, upload_id: str, **changes: object) -> None:
        self._update(f"UPLOAD#{upload_id}", "METADATA", **changes)

    # ------------------------------------------------------------ idempotency
    def claim(self, key: str, response: dict[str, object]) -> dict[str, object] | None:
        try:
            self._client.put_item(
                TableName=self._settings.table_name,
                Item={
                    "PK": {"S": f"IDEMPOTENCY#{key}"},
                    "SK": {"S": "METADATA"},
                    "idempotency_key": {"S": key},
                    "response": {"M": {k: self._to_ddb(v) for k, v in response.items()}},
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
            return None
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == CONDITIONAL_CHECK_FAILED:
                item = self._get(f"IDEMPOTENCY#{key}", "METADATA")
                return cast(dict[str, object], item.get("response")) if item else {}
            raise

    def get(self, key: str) -> dict[str, object] | None:
        item = self._get(f"IDEMPOTENCY#{key}", "METADATA")
        return cast(dict[str, object], item.get("response")) if item else None

    # ------------------------------------------------------------------ utils
    def _get(self, pk: str, sk: str) -> dict[str, Any] | None:
        response = self._table.get_item(Key={"PK": pk, "SK": sk})
        return cast(dict[str, Any], response.get("Item"))

    def _query_one(self, index: str, key_condition: Any) -> dict[str, Any] | None:
        response = self._table.query(IndexName=index, KeyConditionExpression=key_condition)
        items = cast(list[dict[str, Any]], response.get("Items", []))
        return items[0] if items else None

    def _scan(self, filter_expression: Any) -> list[dict[str, Any]]:
        response = self._table.scan(FilterExpression=filter_expression)
        return cast(list[dict[str, Any]], response.get("Items", []))

    def _structure(
        self, model: Any, pk: str, sk: str, extra: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        data = cast(dict[str, Any], model.model_dump())
        data["PK"] = pk
        data["SK"] = sk
        if extra:
            data.update(extra)
        return data

    def _item(
        self, model: Any, pk: str, sk: str, extra: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self._structure(model, pk, sk, extra)

    def _content_extra(self, content_id: str, state: str, published_at: str) -> dict[str, Any]:
        return {
            "gsi_content_pk": f"CONTENT#{content_id}",
            "gsi_content_sk": "METADATA",
            "gsi_mod_pk": f"MODQUEUE#{state}"
            if state in ("PENDING", "FLAGGED")
            else "MODQUEUE#NONE",
            "gsi_mod_sk": f"{published_at}#{content_id}",
            "content_id": content_id,
        }

    def _conditional_put(self, item: dict[str, Any], condition: str) -> bool:
        try:
            self._client.put_item(
                TableName=self._settings.table_name,
                Item={k: self._to_ddb(v) for k, v in item.items()},
                ConditionExpression=condition,
            )
            return True
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == CONDITIONAL_CHECK_FAILED:
                return False
            raise

    def _update(self, pk: str, sk: str, **changes: object) -> None:
        if not changes:
            return
        names: dict[str, str] = {}
        values: dict[str, Any] = {}
        assignments: list[str] = []
        for i, (key, value) in enumerate(changes.items()):
            placeholder_key = f"#k{i}"
            placeholder_value = f":v{i}"
            names[placeholder_key] = key
            values[placeholder_value] = self._to_ddb(value)
            assignments.append(f"{placeholder_key} = {placeholder_value}")
        self._client.update_item(
            TableName=self._settings.table_name,
            Key={"PK": {"S": pk}, "SK": {"S": sk}},
            UpdateExpression="SET " + ", ".join(assignments),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )

    def _add(self, pk: str, sk: str, field: str, delta: int) -> None:
        self._client.update_item(
            TableName=self._settings.table_name,
            Key={"PK": {"S": pk}, "SK": {"S": sk}},
            UpdateExpression=f"ADD {field} :delta",
            ExpressionAttributeValues={":delta": {"N": str(delta)}},
        )

    def _update_mod_queue(self, pk: str, sk: str, state: str) -> None:
        item = self._get(pk, sk)
        published_at = str(item.get("created_at", utc_now())) if item else utc_now()
        content_id = str(item.get("content_id", "")) if item else ""
        if state in ("PENDING", "FLAGGED"):
            self._update(
                pk, sk, gsi_mod_pk=f"MODQUEUE#{state}", gsi_mod_sk=f"{published_at}#{content_id}"
            )
        else:
            self._client.update_item(
                TableName=self._settings.table_name,
                Key={"PK": {"S": pk}, "SK": {"S": sk}},
                UpdateExpression="REMOVE gsi_mod_pk, gsi_mod_sk",
            )

    @staticmethod
    def _to_ddb(value: object) -> Any:
        if value is None:
            return {"NULL": True}
        if isinstance(value, bool):
            return {"BOOL": value}
        if isinstance(value, str):
            return {"S": value}
        if isinstance(value, int):
            return {"N": str(value)}
        if isinstance(value, float):
            return {"N": repr(value)}
        if isinstance(value, dict):
            return {"M": {str(k): DynamoDBRepository._to_ddb(v) for k, v in value.items()}}
        if isinstance(value, list):
            return {"L": [DynamoDBRepository._to_ddb(v) for v in value]}
        if hasattr(value, "value"):
            return {"S": str(value.value)}
        return {"S": str(value)}
