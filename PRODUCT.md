# AI-Moderated School Forum — Product Definition

- **Status:** Draft product source of truth
- **Working name:** TBD
- **Product type:** School-focused social network and discussion forum
- **Primary deployment:** AWS
- **Local development:** MiniStack in Docker

## 1. Product summary

Build a trusted online forum where students and staff can share short posts, ask questions, discuss school life, and participate in school or course communities.

Interaction combines:

- Twitter-like short-form posting, profiles, following, feeds, and replies
- Reddit-like school/community spaces, threaded discussion, discovery, and upvotes
- AI-assisted safety checks that automatically classify and flag potentially unsafe text and images for human review

The product is a social forum first. Moderation should protect normal conversation without turning the experience into an AI dashboard or presenting AI decisions as infallible.

## 2. Problem

School conversations are fragmented across unofficial group chats, generic social networks, and learning systems that are poor at informal community discussion. Generic networks also lack school context and place most abuse handling after harmful content has spread.

Users need:

- One discoverable place for school questions and community discussion
- Confidence that participants belong to the relevant institution
- Fast, understandable safety intervention
- Fair review and appeal when automation is wrong
- Clear separation between community moderation and school administration

## 3. Vision

Create the safest useful digital common room for a school community: quick enough for everyday conversation, structured enough for durable discussion, and accountable enough for a trusted institution context.

## 4. Product principles

1. **Forum first.** Posting, reading, replying, and finding communities must remain simple.
2. **Safety before reach.** Unreviewed high-risk content must not gain distribution.
3. **AI assists people.** Models recommend; documented policy and human moderators resolve ambiguity.
4. **Explain outcomes.** Users receive a useful reason category and next action without exposing exploit-ready thresholds.
5. **Private by default.** School content is limited to authorized members unless a space is explicitly approved as public later.
6. **Tenant boundaries are hard boundaries.** Membership in one institution never grants access to another.
7. **Collect less.** Avoid unnecessary personal data, content logging, and identifiable analytics.
8. **Accessibility is core.** Safety and community workflows must work with keyboards and assistive technology.

## 5. Users and roles

### Student

- Joins through a verified institution identity/email flow
- Reads school and joined-space feeds
- Creates posts, replies, and upvotes
- Follows users or spaces
- Reports content and appeals decisions on their own content

### Staff member

- Has normal community capabilities
- Can receive a visibly verified staff role when institution policy permits
- Does not automatically gain moderator access

### Community moderator

- Reviews queued content and user reports for assigned spaces
- Approves, restricts, or removes content using policy reason codes
- Records notes and escalates serious incidents
- Cannot alter platform configuration or view unrelated tenants

### School administrator

- Manages institution membership, roles, spaces, and institution-level policy settings
- Views institution-level safety and adoption summaries
- Cannot inspect private data outside documented permissions

### Platform administrator

- Operates the service, policy versions, abuse controls, and cross-tenant incidents
- Uses audited, least-privilege access

## 6. MVP scope

### 6.1 Identity and membership

- Sign up/sign in through Amazon Cognito
- Verify institution membership using approved school email domains or admin-issued invitations
- Create a profile with display name, handle, avatar, short bio, school, and role badge
- Enforce user status: `ACTIVE`, `SUSPENDED`, or `DEACTIVATED`
- Support student, staff, moderator, school-admin, and platform-admin authorization
- Sign out and deactivate account

**MVP constraint:** one active institution membership per user. Multi-school membership can follow later.

### 6.2 School and community spaces

- Institution home space exists for every school
- Authorized users can discover and join approved spaces such as courses, clubs, cohorts, and campus topics
- Spaces have name, description, rules, visibility, owner/moderators, and member count
- MVP visibility: institution-wide or members-only; no anonymous public posting
- Space moderators can pin and lock posts

### 6.3 Posts and discussion

- Create a short text post with optional single image
- Post into institution home or one joined space
- View institution, joined-space, following, and user-profile feeds
- Open a post and read threaded replies
- Reply to a post or reply, with a bounded nesting depth in MVP
- Upvote/un-upvote once per user
- Follow/unfollow users and spaces
- Edit own text during a limited edit window; keep an audit reference to moderation of edited versions
- Delete own content from normal views
- Show created/edited time, author identity, space, moderation state for own content, reply count, and upvote count
- Use cursor pagination and deterministic feed ordering

### 6.4 Reporting and blocking

- Report a post, reply, or user using predefined reason categories plus optional context
- Prevent duplicate open reports from the same reporter for the same target
- Block a user so their content is hidden from the blocker and direct interaction is restricted
- Rate-limit reports and detect report abuse
- Give reporters confirmation without revealing confidential enforcement details

### 6.5 Moderation console

- Queue items by institution, space, risk category, age, source, and status
- Show content only to authorized moderators with an explicit sensitive-content warning
- Display normalized labels and scores, policy reason, relevant report context, and prior actions
- Actions: approve, retain with warning, reject/remove, lock discussion, escalate, or mark report invalid
- Require reason codes for decisions and notes for escalations
- Record actor, timestamp, content version, policy version, and before/after state
- Support reassignment and prevent accidental duplicate resolution

### 6.6 Appeals

- Author can appeal an automated rejection or moderator removal once within a defined window
- Appeal requires optional context and enters a queue separate from the original decision
- Reviewer should differ from the original human reviewer where staffing allows
- Outcome is upheld or reversed with a user-facing reason category
- Every appeal is auditable

### 6.7 Notifications

In-app notifications for:

- Replies to the user's post/reply
- Follow events
- Moderator decision on the user's content
- Appeal outcome
- Space announcements

Do not send notifications for content still pending moderation. Email/push notifications are post-MVP unless assessment scope requires them.

## 7. Moderation policy and workflow

### 7.1 Content covered

AI checks apply to new and edited post/reply text and uploaded images. Initial categories:

- Nudity or explicit sexual content
- Hate speech or identity attack
- Harassment or abuse
- Sexual language/content
- Violence or threat
- Graphic content
- Severe profanity where policy requires review
- Spam indicators through deterministic rules and rate limits

Amazon Comprehend provides supported text toxicity labels. Amazon Rekognition provides image moderation labels. Provider output is normalized into internal categories so product behavior does not depend directly on one provider schema.

### 7.2 Decision states

| State      | Meaning                                             | User/feed behavior                                                     |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `PENDING`  | Submitted and awaiting required checks              | Visible to author as processing                                        |
| `APPROVED` | Checks passed or moderator approved                 | Eligible for normal distribution                                       |
| `FLAGGED`  | Needs human review                                  | Visible to author as under review, appear on feed with a warn          |
| `FAILED`   | Moderation could not complete after current attempt | Not published; retry automatically and show temporary processing issue |

Removal after publication is a separate audited action; deleted/removed content disappears from user feeds immediately.

### 7.3 Decision policy

- Low-risk content is approved automatically.
- Medium-confidence or context-dependent content is flagged.
- Clearly severe content may be automatically quarantined/rejected, but permanent account penalties require policy-driven human review.
- Provider timeout, malformed output, unsupported media, or exhausted retry must fail closed rather than publish unchecked content.
- Unsupported language enters review or follows a documented safe fallback; never treat “not analyzed” as “safe.”
- Edited content returns to `PENDING`; prior approved version may remain visible only if product policy explicitly supports versioned publication. MVP removes edited content until re-approved.
- Threshold values and policy versions are configurable, access-controlled, and audited.

### 7.4 Upload flow

1. Authenticated client requests a short-lived presigned upload URL.
2. API authorizes tenant/space, validates declared type/size, and creates pending content/upload records.
3. Client uploads to a private quarantine prefix in S3.
4. Upload event starts validation and Rekognition analysis.
5. Text is analyzed through Comprehend; image and text results merge into one versioned decision.
6. Approved media moves or is copied to an approved private prefix and becomes available through controlled delivery.
7. Flagged/rejected media remains quarantined with lifecycle-based retention.
8. Notification/event updates author and downstream feed projection.

Validate actual file signature, MIME type, dimensions, and size. Strip unnecessary metadata. Images must never become publicly readable directly from S3.

### 7.5 Human safeguards

- Moderators can override automation with a reason.
- Users see understandable policy categories, not raw confidence values or exploit-sensitive thresholds.
- No facial recognition, emotion inference, demographic inference, or biometric identification.
- Synthetic, non-graphic fixtures are used in development and tests.
- Policy changes are versioned and measured for false positives/negatives.

## 8. Primary user journeys

### Publish a safe post

1. User opens a joined space and writes a post.
2. Client validates basic limits and submits it.
3. API stores immutable content version with `PENDING` state.
4. Moderation runs automatically.
5. Content becomes `APPROVED` and appears in relevant feeds.
6. Author sees successful publication.

### Flag unsafe or uncertain content

1. User submits content.
2. Moderation detects risk above review threshold.
3. Content changes to `FLAGGED` and remains out of normal feeds.
4. Moderator reviews normalized evidence and context.
5. Moderator approves or rejects with a reason.
6. Author receives outcome and appeal option when applicable.

### Report published content

1. User selects report reason and submits context.
2. Report is rate-limited, deduplicated, and routed to assigned moderators.
3. Content stays visible, receives a warning, or is temporarily limited based on policy severity—not report count alone.
4. Moderator resolves report and action is audited.

### Appeal a rejection

1. Author opens rejected content and submits appeal context.
2. Appeal enters independent review queue.
3. Authorized reviewer upholds or reverses decision.
4. Reversed content is published if still valid; outcome and audit event are recorded.

## 9. Feed behavior

MVP feeds prioritize predictability over opaque ranking:

- **School feed:** recent approved posts in user's institution
- **Spaces feed:** recent approved posts from joined spaces
- **Following feed:** recent approved posts from followed users
- **Profile feed:** approved posts authored by that user and visible to viewer

Use reverse chronological order with stable cursor pagination. Pinned posts may appear above normal ordering in a space. Personalized algorithmic ranking, trending scores, and recommendation ML are post-MVP.

## 10. High-level data model

Core entities:

- `Institution`
- `User` and `Membership`
- `Space` and `SpaceMembership`
- `Post`
- `Reply`
- `ContentVersion`
- `Reaction`
- `Follow`
- `ModerationJob` and `ModerationDecision`
- `Report`
- `Appeal`
- `Notification`
- `AuditEvent`

Each tenant-owned record carries `institution_id`. Content records separate author-visible content state from moderation details. Store large media in S3, not DynamoDB. Keep provider payloads minimized/redacted and outside general API responses.

Exact DynamoDB partition/sort keys and GSIs belong in an architecture decision record before implementation. Required access patterns include:

- User/institution membership and role lookup
- Space membership and moderator lookup
- Post/reply by ID with tenant authorization
- Recent approved posts by institution, space, author, and followed source
- Replies by parent/post
- One reaction/follow per actor-target pair
- Moderation queue by tenant/status/time/risk
- Reports and appeals by target/status/time
- Notifications by recipient/time
- Audit timeline by target

No request-path access pattern may rely on an unbounded scan.

## 11. AWS architecture

| Capability          | AWS service               | Application use                                                    |
| ------------------- | ------------------------- | ------------------------------------------------------------------ |
| Web hosting         | S3 + CloudFront           | Private SPA origin and cached delivery                             |
| Authentication      | Cognito                   | Sign-in, verified membership, role/tenant claims                   |
| API                 | API Gateway + Lambda      | Authenticated forum and moderation endpoints                       |
| Database            | DynamoDB                  | Social graph, content metadata, workflow state, notifications      |
| Media               | S3                        | Quarantined and approved user uploads; analytics artifacts         |
| Text moderation     | Comprehend                | Toxic-content classification                                       |
| Image moderation    | Rekognition               | Explicit/unsafe image labels only                                  |
| Async orchestration | SQS/EventBridge + Lambda  | Moderation, retries, notifications, audit/event fan-out            |
| Container compute   | ECS Fargate + ECR         | Scheduled/on-demand aggregate analytics worker                     |
| Analytics           | S3 + Glue + Athena        | Sanitized product/safety metrics queried by the app/admin workflow |
| Networking/security | VPC, security groups, IAM | Controlled compute access and least privilege                      |
| Operations          | CloudWatch                | Logs, metrics, alarms, traces/correlation                          |

Production must use real AWS endpoints. Local development routes supported AWS SDK calls to MiniStack at `http://localhost:4566` from the host or `http://ministack:4566` from containers.

If MiniStack does not emulate a required AI behavior, a deterministic local provider returns versioned fixture results through the same interface. Local fallback must be obvious in configuration and must never activate silently in production.

## 12. Non-functional requirements

### Security

- Server-side authorization on every protected request
- Strict tenant isolation tests
- Private S3 buckets, encryption at rest, TLS in transit, and short-lived presigned URLs
- Least-privilege IAM and audited privileged actions
- Input validation, output encoding, safe CORS, and abuse rate limits
- Idempotent consumers and conditional state transitions
- Dependency and secret scanning in CI when available

### Privacy

- Minimize profile and analytics data
- Never log raw user content, credentials, tokens, or presigned URLs
- Define content, rejected-upload, audit, and account-deletion retention before production launch
- Provide deletion/deactivation workflow and institution data export policy
- Avoid identifiable analytics unless a documented metric requires it

### Reliability

- New content remains unpublished when required moderation is unavailable
- Retry transient failures with bounded exponential backoff and DLQ
- Correlation ID follows API request and async events
- Workers tolerate duplicate and out-of-order delivery
- Alarms cover moderation backlog age, DLQ depth, API errors, and provider failures

### Performance targets for MVP

Targets measured under expected assessment/demo load:

- Feed API p95 under 500 ms, excluding cold-start outliers
- Create-post acknowledgement p95 under 1 second before async moderation completes
- Safe text-only moderation decision p95 under 5 seconds
- Safe image moderation decision p95 under 15 seconds
- Initial web page usable on a normal mobile connection without avoidable blocking assets

These are goals, not claims, until load tests provide evidence.

### Accessibility

Meet WCAG 2.1 AA for core flows. Include keyboard navigation, visible focus, semantic headings and controls, accessible form errors, sufficient contrast, reduced motion, alt text support, and non-color-only moderation states.

## 13. Success metrics

### Community value

- Weekly active verified members
- Percentage of active members who post or reply
- Median time to first useful reply
- Seven-day returning-user rate
- Active spaces per institution

### Safety and fairness

- Percentage of content auto-approved, flagged, and rejected
- Median and p95 moderation decision time
- Human-review queue age
- Report resolution time
- Appeal rate and reversal rate by category/policy version
- False-positive sample rate from reviewed auto-decisions
- Repeat violation rate after human-confirmed action

### Reliability

- Successful moderation-job rate
- DLQ depth and oldest job age
- API error rate and latency
- Duplicate event side effects: target zero
- Cross-tenant access test failures: target zero

Metrics must not incentivize suppressing legitimate reports or maximizing engagement at the expense of safety.

## 14. Out of scope for MVP

- Direct/private messaging
- Anonymous accounts or anonymous posting
- Public internet communities outside verified institutions
- Video, audio, live streaming, and multi-image posts
- Advertising, monetization, creator payouts, or commercial recommendations
- Facial recognition or biometric inference
- End-to-end encrypted communication
- Full learning-management-system features, grading, or assignment submission
- Algorithmic “For You” ranking
- Automated permanent bans based only on an AI score
- Native mobile applications

## 15. Delivery phases

### Phase 0 — Foundation

- Rename/remove CloudPulse legacy domain safely
- Define DynamoDB access patterns and event schemas
- Provision MiniStack-compatible identity substitute/test claims, API, tables, buckets, queues, and observability
- Establish CI checks and synthetic moderation fixtures

### Phase 1 — Forum core

- Cognito membership and roles
- Institution/spaces, profiles, posting, replies, feeds, upvotes, follows
- Private media upload and basic notifications
- Tenant-boundary and accessibility tests

### Phase 2 — Safety workflows

- Comprehend/Rekognition providers
- Async moderation state machine, retries, and DLQ
- Reports, moderator console, audit trail, and appeals
- Policy configuration and safety metrics

### Phase 3 — AWS assessment completeness

- ECS analytics worker and ECR image flow
- Sanitized S3 event export, Glue catalog, and Athena admin queries
- CloudFront deployment, CloudWatch alarms, security review, load test, and demo evidence
- Confirm every claimed AWS service is triggered by normal application operations

## 16. MVP release acceptance

MVP is releasable when:

- Verified users can join their institution, discover spaces, create moderated posts/replies, read feeds, upvote, follow, report, and block.
- Unsafe/uncertain content follows explicit pending/flagged/rejected behavior and never bypasses required checks.
- Authorized moderators can resolve reports and AI flags; authors can appeal eligible decisions.
- Every privileged action and moderation transition is auditable.
- Cross-tenant authorization, moderation failure, duplicate delivery, and provider timeout tests pass.
- Core flows work with keyboard-only navigation and responsive mobile layouts.
- Local end-to-end flow runs against MiniStack without real AWS credentials or paid AI calls.
- Production provisioning is rerunnable and uses least-privilege IAM, private storage, and operational alarms.
- Product metrics use sanitized events and can be queried through the application-supported Athena workflow.

## 17. Open decisions

Resolve before relevant implementation:

1. Product name and visual identity
2. Eligible institution domain/invitation policy
3. Minimum user age and applicable school/privacy policies
4. Exact post/reply character, image size, and edit-window limits
5. Whether school administrators may delegate space creation to students
6. Moderator staffing, response-time targets, escalation contacts, and emergency protocol
7. Detailed policy thresholds and treatment of credible threats/self-harm content
8. Supported languages and manual-review coverage
9. Data retention, legal hold, account deletion, and institution offboarding periods
10. Whether approved media is delivered through CloudFront signed URLs or an API-authorized proxy
