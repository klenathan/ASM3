Backend Implementation Plan
This plan targets the full product MVP with:

- RMIT-only membership
- Societies exposed as /r/{slug}
- Posts as root discussions
- Nested comments
- Votes, follows, reports, blocks, moderation, appeals, notifications
- Single-image uploads
- AI-flagged content visible behind a warning
- Multiple API and worker Lambdas
  No files were changed during planning.

1. Domain Decisions
   Use one canonical model for each concept:
   Product concept Backend entity
   RMIT community Fixed institution with ID rmit
   Reddit /r group Society
   Thread/discussion Post
   Nested reply Comment
   Upvote Vote
   Society subscription SocietyMembership
   User subscription Follow
   Do not create separate Thread, Discussion, and Post entities.
   Keep institution_id="rmit" on tenant-owned records even though MVP is RMIT-only. This costs little and preserves authorization boundaries without building multi-institution administration.
2. Target Lambda Architecture
   Lambda Responsibility
   health-api Public health and readiness
   identity-api Profile bootstrap, current user, account deactivation
   societies-api Society discovery, membership, rules, moderators
   content-api Posts, comments, feeds, editing, deletion
   engagement-api Votes, follows, blocks, reports, notifications
   moderation-api Review queues, decisions, appeals, audit history
   media-api Presigned upload requests and controlled media access
   moderation-worker SQS text moderation through Comprehend/local adapter
   image-worker Validate S3 uploads and run Rekognition/local adapter
   event-worker Feed projections, counters, notifications, sanitized analytics
   analytics-api Authorized Athena queries and ECS analytics execution
   analytics-worker ECS aggregation of sanitized forum events
   Each API Lambda can remain a small FastAPI application wrapped by Mangum. Shared domain and repository code remains in one Python package.
   Use SQS for reliable work and EventBridge for schedules/domain-event fan-out. Do not make synchronous AI calls from request handlers.
3. Proposed Backend Layout
   Rename cloudpulse to rmit_society as a coordinated migration:
   backend/src/rmit_society/
   ├── api.py
   ├── aws.py
   ├── config.py
   ├── errors.py
   ├── logging.py
   ├── auth/
   │ ├── claims.py
   │ ├── dependencies.py
   │ └── jwt.py
   ├── domain/
   │ ├── users.py
   │ ├── societies.py
   │ ├── content.py
   │ ├── engagement.py
   │ ├── moderation.py
   │ └── events.py
   ├── services/
   │ ├── identity.py
   │ ├── societies.py
   │ ├── content.py
   │ ├── feeds.py
   │ ├── engagement.py
   │ ├── moderation.py
   │ ├── media.py
   │ └── analytics.py
   ├── repositories/
   │ ├── interfaces.py
   │ └── dynamodb.py
   ├── providers/
   │ ├── comprehend.py
   │ ├── rekognition.py
   │ ├── local_moderation.py
   │ ├── media.py
   │ ├── queues.py
   │ └── analytics.py
   ├── handlers/
   │ ├── health.py
   │ ├── identity.py
   │ ├── societies.py
   │ ├── content.py
   │ ├── engagement.py
   │ ├── moderation.py
   │ ├── media.py
   │ └── analytics.py
   └── workers/
   ├── moderation.py
   ├── image.py
   ├── events.py
   └── analytics.py
   Handlers must only authenticate, validate, call a service, and serialize the result.
4. Core Data Model
   Use a new on-demand DynamoDB single table instead of mixing forum records with CloudPulse data.
   Every record should include:

- entity_type
- institution_id
- created_at
- updated_at
- Version or revision where conditional updates matter
  Core entities:
- User
- Society
- SocietyMembership
- Post
- Comment
- ContentVersion
- Vote
- Follow
- Block
- Report
- Appeal
- ModerationJob
- ModerationDecision
- Notification
- AuditEvent
- FeedEntry
- IdempotencyRecord
- Upload
  Example primary keys:
  PK=USER#{user_id} SK=PROFILE
  PK=USER#{user_id} SK=SOCIETY#{society_id}
  PK=USER#{user_id} SK=FOLLOW#{target_user_id}
  PK=USER#{user_id} SK=BLOCK#{target_user_id}
  PK=USER#{user_id} SK=NOTIFICATION#{timestamp}#{id}

PK=SOCIETY#{society_id} SK=PROFILE
PK=SOCIETY#{society_id} SK=MEMBER#{user_id}

PK=POST#{post_id} SK=METADATA
PK=POST#{post_id} SK=VERSION#{version}
PK=POST#{post_id} SK=COMMENT#{path}#{comment_id}

PK=CONTENT#{content_id} SK=VOTE#{user_id}
PK=CONTENT#{content_id} SK=REPORT#{reporter_id}

PK=MODERATION#{content_id} SK=JOB#{version}
PK=MODERATION#{content_id} SK=DECISION#{timestamp}

PK=APPEAL#{appeal_id} SK=METADATA
PK=AUDIT#{target_id} SK={timestamp}#{event_id}
Required GSIs or equivalent projection items:

- Society slug lookup
- Unique user handle lookup
- School feed by publish time
- Society feed by publish time
- Author feed by publish time
- Comments by post and parent path
- Moderation queue by state/risk/time
- Reports by state/time
- Appeals by state/time
- Notifications by recipient/time
  No request route may use Scan.

5. Content and Moderation State
   Use:
   PENDING -> APPROVED | FLAGGED | REJECTED | FAILED
   Rules:

- PENDING, REJECTED, FAILED, deleted, and moderator-removed content never enter normal feeds.
- APPROVED content is published normally.
- FLAGGED content may enter feeds with requires_warning=true.
- Flagged bodies and images should be hidden by default until the client explicitly reveals them.
- Severe policy matches can transition directly to REJECTED.
- Provider errors transition to FAILED, fail closed, and remain retryable.
- Edits create a new immutable ContentVersion and return content to PENDING.
- Moderator actions use conditional state transitions to prevent duplicate resolution.
- Permanent account penalties cannot be based only on AI output.
  Store normalized labels, provider, model version, policy version, decision, timestamps, and reviewer outcome. Do not expose raw provider payloads or thresholds in ordinary APIs.

6. Main API Contract
   Use /api/v1.
   Identity
   GET /me
   PATCH /me
   POST /me/deactivate
   GET /users/{handle}
   Societies
   GET /societies
   POST /societies
   GET /r/{slug}
   PATCH /r/{slug}
   POST /r/{slug}/join
   DELETE /r/{slug}/join
   GET /r/{slug}/members
   PUT /r/{slug}/moderators/{user_id}
   DELETE /r/{slug}/moderators/{user_id}
   Only RMIT administrators or delegated roles may create societies.
   Posts and comments
   POST /r/{slug}/posts
   GET /r/{slug}/posts
   GET /posts/{post_id}
   PATCH /posts/{post_id}
   DELETE /posts/{post_id}
   POST /posts/{post_id}/comments
   GET /posts/{post_id}/comments
   PATCH /comments/{comment_id}
   DELETE /comments/{comment_id}
   POST /comments/{comment_id}/comments
   POST /posts/{post_id}/pin
   POST /posts/{post_id}/lock
   Enforce configurable edit windows and bounded comment depth.
   Feeds
   GET /feeds/rmit
   GET /feeds/joined
   GET /feeds/following
   GET /users/{handle}/posts
   All list responses use:
   {
   "items": [],
   "next_cursor": null
   }
   Cursors must be tamper-resistant, versioned, and treated as opaque by clients.
   Engagement and safety
   PUT /posts/{post_id}/vote
   DELETE /posts/{post_id}/vote
   PUT /comments/{comment_id}/vote
   DELETE /comments/{comment_id}/vote
   PUT /users/{user_id}/follow
   DELETE /users/{user_id}/follow
   PUT /users/{user_id}/block
   DELETE /users/{user_id}/block
   POST /reports
   GET /notifications
   POST /notifications/{id}/read
   Votes, follows, blocks, and open reports use conditional writes for uniqueness.
   Moderation and appeals
   GET /moderation/queue
   GET /moderation/items/{content_id}
   POST /moderation/items/{content_id}/decisions
   POST /content/{content_id}/appeals
   GET /moderation/appeals
   POST /moderation/appeals/{appeal_id}/decision
   GET /audit/{target_type}/{target_id}
   Moderator queue access must verify assignment to the relevant society.
   Media
   POST /uploads
   GET /uploads/{upload_id}
   GET /media/{media_id}/access
   POST /uploads returns a short-lived presigned S3 PUT URL and required headers. Never return permanent public S3 URLs.
7. Authentication and Authorization
   Provision Cognito with:

- Email verification
- SPA client without a secret
- RMIT email-domain restriction or administrator invitation
- API Gateway JWT authorizer
- Issuer, audience, signature, expiry, and subject validation
  Canonical status and roles remain in DynamoDB:
  STUDENT
  STAFF
  MODERATOR
  RMIT_ADMIN
  PLATFORM_ADMIN
  Every protected operation must also verify:
- User status is ACTIVE
- User belongs to RMIT
- Society membership where required
- Society moderator assignment for moderation
- Resource ownership for edit/delete/appeal
- Block restrictions for direct interaction
  Do not trust client-provided user IDs, role names, institution IDs, or moderation states.

8. Asynchronous Workflows
   New post or comment
1. API validates authorization and idempotency key.
1. Store immutable version in PENDING.
1. Enqueue ContentSubmitted.v1.
1. Moderation worker classifies text.
1. Image worker contributes image decision if present.
1. Final decision uses a conditional transition.
1. Event worker writes feed projections and notifications.
1. API immediately returns the author-visible pending record.
   Image upload
1. Media API authorizes the society and creates an upload record.
1. Client uploads to quarantine/{opaque-id}.
1. S3 event sends work to the image queue.
1. Worker validates signature, MIME, dimensions, and size.
1. Worker strips unnecessary metadata and runs Rekognition.
1. Approved media moves to a private approved prefix.
1. Rejected media remains quarantined until lifecycle deletion.
1. Text and image decisions merge idempotently.
   Reports and appeals

- Reports are deduplicated by reporter and target.
- Reports do not automatically punish users based on count.
- Appeals are limited to eligible authors and one open appeal per decision.
- Every resolution creates an audit event.
- Notification events are emitted only after moderation outcomes are final.

9. Feed Strategy
   Create feed projection records only after content reaches APPROVED or FLAGGED.
   Maintain:

- RMIT feed
- Society feed
- Author profile feed
- Personalized joined/following feed
  Use the event worker for fan-out and deduplicate personalized entries by post ID. Moderation removal, deletion, blocking, and state changes must remove or suppress projections idempotently.
  Pinned posts should be returned separately from the paginated chronological society feed.

10. Infrastructure Changes
    Extend infra/deploy.py while preserving direct boto3 reconciliation:

- New RMIT Society resource prefix
- New DynamoDB table with GSIs, PITR in AWS, and TTL
- Cognito user pool and SPA client
- API Gateway JWT authorizer
- Per-Lambda least-privilege roles
- Media and sanitized analytics buckets
- SQS queues and DLQs
- Lambda event-source mappings
- S3 upload notifications
- EventBridge schedules/rules
- Comprehend and Rekognition worker permissions
- CloudWatch log retention, metrics, and alarms
- ECR lifecycle policy and immutable image tags
- Narrow CORS based on configured frontend origins
- Private CloudFront SPA origin
- Sanitized Glue tables and Athena workgroup
  Use separate buckets for:
  rmit-society-{stage}-web
  rmit-society-{stage}-media
  rmit-society-{stage}-analytics
  Do not destroy existing CloudPulse AWS resources during the migration. Provision replacements first; teardown requires separate approval.

11. Redundant Code Removal
    Remove after replacement handlers are operational:

- backend/src/cloudpulse/open_meteo.py
- backend/src/cloudpulse/slug.py
- backend/src/cloudpulse/repository.py
- backend/src/cloudpulse/models.py
- backend/src/cloudpulse/handlers/observations.py
- Weather portions of analytics.py
- Weather portions of worker.py
- backend/tests/test_models.py
- Melbourne seed data
- Weather Glue schema and Athena SQL
- /locations API routes
- CloudPulse package/build names
- Duplicate health implementation
- Unbounded DynamoDB scans
- Wildcard CORS
- Shared broad Lambda IAM role
  Retain and adapt:
- FastAPI/Mangum pattern
- Central settings
- Central AWS endpoint handling
- Lambda packaging
- ECS worker container pattern
- Athena polling
- Private S3 and CloudFront foundations
- Stage-based resource naming

12. Implementation Sequence
1.  Foundation: Rename package, establish settings, errors, logging, IDs, timestamps, cursor codec, auth interfaces, and test fixtures.
1.  Data layer: Document access patterns, create domain models, repository protocols, DynamoDB adapter, conditional writes, transactions, and pagination.
1.  Identity and societies: Implement Cognito claims, profile bootstrap, RMIT membership, society discovery, joining, and moderator assignments.
1.  Forum core: Implement posts, comments, edit/delete, locking, pinning, votes, feeds, follows, and blocks.
1.  Media: Implement upload records, presigned URLs, quarantine validation, private delivery, and lifecycle handling.
1.  Moderation: Implement versioned events, local deterministic adapter, Comprehend/Rekognition adapters, SQS consumers, retries, DLQs, and state transitions.
1.  Safety workflows: Implement reports, moderator decisions, appeals, audits, and notifications.
1.  Analytics: Replace weather exports with sanitized forum events, then adapt ECS, Glue, Athena, and admin APIs.
1.  Infrastructure cutover: Add new routes/resources and remove stale CloudPulse routes from reconciliation.
1.  Cleanup: Delete legacy weather code only after forum handlers and tests pass.
1.  Documentation: Update root/backend README, environment examples, route documentation, data retention, and local MiniStack workflow.
1.  Required Verification
    Run:
    cd backend
    uv sync
    uv run ruff check .
    uv run mypy
    uv run pytest
    Tests must cover:

- JWT issuer, audience, expiry, and signature validation
- RMIT membership and role authorization
- Cross-society authorization
- Post/comment ownership and lock behavior
- Bounded nesting
- Feed exclusion and warning behavior by moderation state
- Cursor stability
- Duplicate votes, follows, reports, and events
- Edit-window boundaries
- Safe, flagged, rejected, failed, and unsupported moderation
- Provider timeout and malformed output
- Duplicate and out-of-order SQS delivery
- Media signature, MIME, size, and dimension validation
- Moderator override and appeal reversal
- Deleted and blocked content visibility
- No sensitive data in logs or analytics
- MiniStack workflows without production AI calls
- Idempotent infrastructure reconciliation
  The next implementation agent should execute this plan incrementally and keep the application runnable throughout, rather than deleting the CloudPulse package before replacement handlers exist.
