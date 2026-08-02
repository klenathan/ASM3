# RMIT Society — Project Instructions

## Product vocabulary

- **Society** means an RMIT community, equivalent to a subreddit.
- **Thread** means a post within a society.
- Roles follow: **User / Student → Moderator / Society Admin → System Admin**.

## Product constraints

- Product is an RMIT-only community forum.
- Registration requires an approved RMIT email from an AU, VN, or EU domain. Keep exact domain allow-list configurable; do not hard-code unconfirmed domains.
- Core capabilities: authentication, societies, threads, comments, voting, reporting, moderation, user/role management, and system operations.
- Deploy application on AWS and keep AWS use directly connected to user-visible workflows.
- Follow `ASSESSMENT_3_S2-1.pdf`, including automated service invocation and solution-architecture documentation requirements.

## Current AWS decisions

- **Compute:** Amazon EC2. Do not replace primary compute with Lambda unless requirements change.
- **Containers:** Use Amazon ECS with EC2 launch type where orchestration is needed. Reuse EC2 capacity instead of adding Fargate baseline cost.
- **Storage:** Amazon S3 for uploaded media and static assets.
- **Database:** Amazon RDS. Do not substitute DynamoDB without approval.
- **Analytics:** Deferred for current milestone. Do not provision analytics services yet; assessment requires this category before final submission.
- **Networking/content delivery:** Amazon CloudFront. Use it for cached delivery of the web client and S3 media while keeping request volume and cache behavior cost-conscious.

## Cost and infrastructure rules

- Optimize for a low-cost coursework deployment and a reliable live demo, not production-scale overprovisioning.
- Start with one small EC2 instance and one small, Single-AZ RDS instance; scale only from measured need.
- Avoid always-on duplicate capacity, Multi-AZ, NAT Gateway, load balancers, and paid observability tiers unless clearly required and approved.
- Keep media out of RDS; store objects in S3 and persist only metadata/object keys in RDS.
- Make infrastructure reproducible with infrastructure as code. Keep environment-specific values configurable.
- Never commit AWS credentials, secrets, private keys, `.env` contents, or database passwords.
- Tag AWS resources for project, environment, and owner. Document teardown steps and remove unused resources after demos.

## Engineering priorities

1. Smallest complete MVP supporting student, moderator, and system-admin demo flows.
2. Correct authorization and society-scoped moderation.
3. Reliable deployment and repeatable demo data.
4. Clear evidence that each AWS service is invoked automatically by UI operations or application code.
5. Add deferred assessment categories only when their product purpose and demo path are defined.
