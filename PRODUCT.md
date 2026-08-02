# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The `web` frontend uses React 19, Vite 8, TypeScript 7, Tailwind CSS 4, shadcn/ui, React Router 7, TanStack Query, and pnpm. The backend uses Node.js 22, Hono, TypeScript, Drizzle ORM, and PostgreSQL as a domain-oriented modular monolith. See `docs/BACKEND_ARCHITECTURE.md`. AWS deployment choices are confirmed below; keep the system simple enough for one student to implement, explain, deploy, and demonstrate reliably.

## Users

- **User / Student:** Registers or signs in with an approved RMIT email, discovers societies, creates threads, comments, votes, edits their profile, and reports content.
- **Moderator / Society Admin:** Manages assigned societies, society rules, threads, comments, and reports.
- **System Admin:** Manages users and roles, platform configuration, system health, backups, security issues, and escalated moderation.

Role hierarchy: `User / Student → Moderator / Society Admin → System Admin`.

## Product Purpose

RMIT Society is an RMIT-only community forum where students can find relevant communities and hold structured discussions. A society is equivalent to a subreddit; a thread is equivalent to a post.

Success means students can complete the main discussion workflow, moderators can keep assigned societies safe, administrators can control platform access, and the full system can be reliably demonstrated as an AWS-hosted cloud application.

## Positioning

Unlike a generic public forum, membership is restricted to RMIT identities across AU, VN, and EU email domains. Communities, permissions, and moderation workflows are organized around RMIT societies.

## Operating Context

Primary workflows:

1. Register or sign in using an approved RMIT email.
2. Browse and join societies.
3. Create a thread, comment, and vote.
4. Report inappropriate content.
5. Let a society moderator review and resolve the report.
6. Let a system administrator manage users, roles, security, and escalations.

The application is an individual cloud-computing assessment project. It must run on AWS, support a live demonstration, and have a solution-architecture document explaining service purpose and interactions.

## Capabilities and Constraints

### Core capabilities

- Authentication and RMIT email eligibility validation
- Society discovery and membership
- Thread creation, reading, updating, and moderation
- Nested or flat comments; final comment model remains open
- Upvotes/downvotes with duplicate-vote prevention
- Content reporting and report-resolution workflow
- Society-scoped moderator permissions
- System-admin user and role management
- Profile editing
- Basic system monitoring and backup operations

### AWS decisions

- **Compute:** Amazon EC2
- **Containers:** Amazon ECS using EC2 launch type when orchestration is needed
- **Storage:** Amazon S3 for media objects
- **Database:** Amazon RDS
- **Analytics:** Deferred for the current milestone; must be revisited because the assessment requires an Analytics-category AWS service
- **Networking and content delivery:** API Gateway provides the HTTPS entry point for the Nginx-served web client and backend API; CloudFront is unavailable in Learner Lab

Every graded AWS service must be fully implemented and invoked automatically by the client, application code, or another service—not only through CLI or AWS Console.

### Cost constraint

Minimize ongoing deployment cost. Begin with small, Single-AZ resources and avoid unnecessary always-on services or duplicate capacity. Reliability for the assessed live demo takes priority over production-scale high availability.

### Open decisions

- Exact approved RMIT AU, VN, and EU email-domain allow-list
- Authentication implementation and email-verification mechanism
- Final Analytics service and user-visible analytics workflow
- Whether society creation is limited to system admins or can be requested by students

## Brand Commitments

- Product name: **RMIT Society**
- Use the terms **society** and **thread**, not subreddit and post, in product UI.
- Use a modern red-orange visual identity inspired by RMIT's energy, contrast, and creative culture.
- Keep the identity unofficial: do not imply RMIT endorsement or reproduce official logos, lockups, or campaign assets without approval.

## Visual Direction

RMIT Society uses red-orange as its lead action and navigation color against warm publication-paper neutrals. Deep ink surfaces support a deliberate dark mode. A restrained yellow signal color is reserved for focus, unread, and time-sensitive states; every state also uses text, icons, or shape. The forum should feel like a contemporary student publication: confident, editorial, and easy to scan rather than institutional or overly branded.

## Evidence on Hand

- `ASSESSMENT_3_S2-1.pdf`: binding assessment requirements and rubric
- Initial role and system-capability diagram supplied in the product brief
- No confirmed logo, official RMIT brand assets, user research, testimonials, or production datasets are currently available; do not fabricate them.

## Product Principles

1. **RMIT access first:** Keep community participation limited to eligible RMIT identities.
2. **Society ownership:** Make moderation powers explicit and scoped to assigned societies.
3. **Visible accountability:** Give reports clear statuses, ownership, and resolution outcomes.
4. **Assessment-visible cloud value:** Every AWS service must support a demonstrable product workflow.
5. **Cost-conscious delivery:** Prefer the smallest architecture that remains secure, reproducible, and dependable during assessment.

## Accessibility & Inclusion

Support keyboard navigation, visible focus states, semantic structure, sufficient color contrast, and clear non-color status indicators. Design responsive flows for desktop and mobile web. Treat users across RMIT AU, VN, and EU consistently; localization requirements remain open.
