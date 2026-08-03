# RMIT Society — Project Instructions

## Token efficiency & exploration scope

- Prefer the subagent system over the main loop to save tokens: delegate long-running, independent, or read-heavy work (research, exploration, bulk reads) to subagents instead of doing it inline.
- Keep the main thread thin; hand off tool-heavy or exploratory tasks to subagents and consume only their summarized results.
- When exploring, stay inside this repository only. Do not explore, search, or read outside this repo (no system-wide scans, no unrelated paths) unless the task explicitly requires it.

## Product vocabulary

- **Society** means an RMIT community, equivalent to a subreddit.
- **Thread** means a post within a society.
- Roles follow: **User / Student → Moderator / Society Admin → System Admin**.

## Backend architecture

- Treat `backend` as a domain-oriented modular monolith. Follow `docs/BACKEND_ARCHITECTURE.md` as the backend structure and logical-schema baseline.
- Organize product code by bounded context under `backend/src/modules/<context>/`, then by `domain`, `application`, `infrastructure`, and `presentation`.
- Required dependency flow: **Route → Controller → Service → Repository port → Infrastructure adapter**.
- Controllers own Hono/OpenAPI/Zod transport concerns only. They must not contain business rules, authorization decisions, transactions, or Drizzle queries.
- Services own use cases, authorization, orchestration, and transaction boundaries. Keep services framework-agnostic and inject dependencies explicitly.
- Domain code must not import Hono, Drizzle, AWS SDKs, or PostgreSQL types.
- Repository interfaces live in the application/domain boundary; Drizzle implementations and table definitions live in the owning module's infrastructure layer.
- Modules communicate through public services or explicit ports, never another module's controller, concrete repository, or tables.
- Keep moderator authority society-scoped through membership. Only `system_admin` is a global elevated role.
- Re-export module-owned Drizzle tables from `backend/src/db/schema.ts` for migration tooling. Generate and review migrations; do not hand-edit generated migration metadata.
- Add focused domain/service/controller tests plus PostgreSQL integration tests for repository and constraint behavior.

## Frontend stack and architecture

- Frontend lives in `web/`. Use existing stack: React 19, Vite 8, TypeScript, pnpm, Tailwind CSS 4, shadcn/ui Radix Nova, React Router 7, TanStack Query, `next-themes`, and `lucide-react`.
- Use `pnpm` commands from `web/`: `pnpm dev`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `pnpm preview`.
- Do not introduce a different frontend framework, router, state library, CSS framework, component library, or package manager. Do not add Next.js, Vue, Redux, Material UI, Bootstrap, or npm/yarn without explicit approval.
- Use Tailwind CSS 4 and existing tokens in `web/src/index.css`. Reuse generated primitives in `web/src/components/ui/`; do not replace shadcn/ui with another UI kit.
- Preserve the confirmed red-orange visual identity: `oklch(0.53 0.18 32)` in light mode and `oklch(0.72 0.17 32)` in dark mode, paired with warm publication-paper neutrals. `PRODUCT.md`, `DESIGN.md`, and `web/src/index.css` must remain aligned. Do not replace this palette with blue, ultramarine, or cool-white styling unless the user explicitly requests a rebrand.
- Use React Router for navigation and route guards. Keep providers, routing, and auth protection in `web/src/app/`; keep `web/src/App.tsx` as a thin application shell.
- Use TanStack Query for server state and request caching. Reuse `web/src/features/auth/` for session state and auth API behavior; do not create duplicate auth or data-fetching layers.
- Organize `web/src` by feature and page, not by one large global component folder:
  - `app/`: providers, routing, and cross-page guards.
  - `pages/<page>/`: route-level screens and page composition.
  - `features/<feature>/`: feature-specific components, hooks, types, and API/services.
  - `components/ui/`: reusable shadcn/ui design-system primitives only.
  - `components/site/`: small cross-page site primitives only.
- A page composes feature components; feature components own feature-specific UI, hooks, types, and API calls. Keep dependency flow explicit: page → feature component/hook → feature API/service.
- Keep components small, focused, and independently understandable. Split components when they mix layout, data fetching, business rules, and presentation, or become difficult to test/reuse.
- Prefer several manageable components over one large page/component. Never grow `App.tsx` into a feature implementation.
- Keep domain-specific components inside their feature or page. Share code only for clear cross-feature use cases; avoid premature generic abstractions and cross-feature implementation imports.
- Preserve current theme behavior: `next-themes` starts dark and uses the `.dark` selector. Keep design tokens in `web/src/index.css`.
- Add focused tests for feature behavior and page-level composition when frontend behavior changes.

## Product constraints

- Product is an RMIT-only community forum.
- Registration requires an approved RMIT email from an AU, VN, or EU domain. Keep exact domain allow-list configurable; do not hard-code unconfirmed domains.
- Core capabilities: authentication, societies, threads, comments, voting, reporting, moderation, user/role management, and system operations.
- Deploy application on AWS and keep AWS use directly connected to user-visible workflows.
- Follow `ASSESSMENT_3_S2-1.pdf`, including automated service invocation and solution-architecture documentation requirements.

## Current AWS decisions

- **Compute:** Amazon EC2. Do not replace primary compute with Lambda unless requirements change.
- **Containers:** Use Amazon ECS with EC2 launch type where orchestration is needed. Reuse EC2 capacity instead of adding Fargate baseline cost.
- **Storage:** Amazon S3 for uploaded media.
- **Database:** Amazon RDS. Do not substitute DynamoDB without approval.
- **Analytics:** Deferred for current milestone. Do not provision analytics services yet; assessment requires this category before final submission.
- **Frontend hosting/content delivery:** AWS Amplify serves the web client and proxies its API requests to API Gateway.
- **Networking:** API Gateway provides the backend HTTPS API. Use CloudFront directly only when Amplify cannot satisfy a confirmed product need.

## AWS Academy Learner Lab constraints

- All infrastructure under `infras/` targets an AWS Academy Learner Lab account, not an unrestricted AWS account. Confirm the active lab's **Resources** or **Service Access** list and region before adding a service; restrictions are class-specific and can change.
- The current stack assumes the **Associate Services** lab. Foundation Services labs may not provide Amplify, API Gateway, ECR, ECS, or Fargate. Do not silently redesign around a missing service; record the limitation and get approval for an alternative.
- Use `us-east-1` for the current deployment. Published Learner Lab restrictions generally allow only `us-east-1` and `us-west-2`; keep all resources in one currently allowed region and do not assume another region will work.
- Do not create IAM users, groups, GitHub OIDC providers, custom instance profiles, or application roles unless the lab explicitly permits them. Reuse the pre-created `LabRole` and `LabInstanceProfile`; infrastructure code should read them rather than manage them.
- Keep EC2 On-Demand usage to Amazon-provided AMIs and nano-to-large instance sizes. Published lab limits include 32 running vCPUs and nine instances per region, with EBS volumes up to 100 GB and only the lab-supported volume types. The current one-instance, `t3.micro`, 30 GB `gp3` setup is intentional.
- Keep RDS to a small, On-Demand, Single-AZ PostgreSQL instance. Do not use Multi-AZ or Enhanced Monitoring. A stopped RDS instance can restart automatically after seven days, and stopping it does not remove storage, backup, or other charges.
- Learner Lab sessions and credits are temporary. `End Lab` stops EC2 but does not reliably stop RDS, Fargate, NAT gateways, load balancers, or storage. Destroy the demo stack after use, and do not treat delayed usage or budget data as proof that spending is safe. Resetting the lab is irreversible and deletes its resources.
- Route 53 domain registration and Marketplace purchasing are unavailable or restricted. Avoid custom domains and Marketplace AMIs unless access has been verified; use the generated Amplify hostname and supported AMIs by default.
- Research references: [AWS Academy Learner Lab Educator Guide](https://d1.awsstatic.com/AWS%20Academy%20Learner%20Lab%20Educator%20Guide.pdf), [EC2 quotas](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-resource-limits.html), [RDS quotas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html), and [RDS stopping behavior](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html).

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
