# RMIT Society Solution Architecture Report Plan

## Purpose

Produce the Assessment 3 solution architecture document for RMIT Society. The report must explain the deployed cloud application, show how every browser-facing operation invokes its downstream components, explain the purpose of each component, describe its data and APIs, compare related work, and cite all external sources in IEEE style.

The assessment document is not a developer manual and must not repeat source code or infrastructure configuration. It is an evidence-led explanation of the system that the assessor can verify in the live demonstration.

## Assessment alignment

| Report section | Assessment requirement | Planned evidence |
| --- | --- | --- |
| Project links | Live project, repository, and any public datasets | Verified live URL, repository URL, and data-source statement |
| Summary | Project objective and purpose | One concise product-and-cloud summary |
| Introduction | Motivation, high-level view, beneficiaries | Role/use-case figure and concise product narrative |
| Related work | Similar applications or work | Comparative analysis of Reddit, Piazza, Discourse, and one institution-oriented community platform if used |
| System architecture | Every client operation, detailed invocations, and component functions | One deployment overview, four operation-flow diagrams, numbered interaction legends, and operation coverage table |
| System descriptions | Purpose of each component | Cloud-component responsibility table |
| Datasets, data structures, APIs | Describe data, structures, and integrations | Data classification table, simplified ERD, grouped API catalogue, and third-party API contracts |
| References | Important development sources and websites | IEEE reference list with citations from every sourced claim |

## Reporting boundary and truthfulness rules

1. Describe the **deployed demonstration architecture**, not an intended future design.
2. A resource may be described as deployed only when it is provisioned in the demonstration environment and can be exercised through an application or automated service-to-service workflow.
3. If a feature is implemented but disabled by an infrastructure feature gate, label it **implemented optional pipeline**. Do not represent it as live assessment evidence until it is enabled and exercised.
4. Do not describe Elastic Beanstalk as the active frontend host unless the hosting cutover is completed and verified. The current repository documentation describes Amplify Hosting as the active frontend hosting path and Elastic Beanstalk as a proposed replacement.
5. Do not include credentials, secret values, database URLs, presigned URLs, account IDs, sensitive ARNs, or private configuration in figures, screenshots, tables, or appendices.
6. Each AWS service claimed for assessment credit must have a named invocation path and a demonstration observation.
7. The final document must use the same component names, service statuses, and URLs as the live demonstration environment.

## Proposed document structure
### Estimated page plan

Target **16 numbered report pages**, plus an unnumbered cover, one table-of-contents page, and optional appendices. This gives the architecture diagrams room to remain readable while keeping the document concise enough for the demonstration walkthrough.

| Document pages | Section | Budget | Layout decision |
| --- | --- | ---: | --- |
| Cover | Cover page | 1 unnumbered page | Product title, assessment details, version, and optional clean product image |
| i | Table of contents | 1 preliminary page | Generate automatically after headings and figures are final |
| 1 | Project links and summary | 1 page | Put the link table above the 150–200 word summary |
| 2 | Introduction | 1 page | Motivation, high-level view, beneficiaries, and Figure 1 role/use-case diagram |
| 3–4 | Related work | 2 pages | One comparative table plus three short analytical subsections |
| 5–10 | System architecture | 6 pages | Operation coverage table, deployment overview, and Figures 3–6; give complex sequence diagrams a full page |
| 11–12 | System descriptions | 2 pages | Component-purpose table plus short rationale tied to client operations |
| 13–14 | Datasets, data structures, and APIs | 2 pages | Data classification table, simplified ERD, grouped API catalogue, and external API contracts |
| 15–16 | References | 2 pages | IEEE list; reduce only if the complete cited bibliography fits cleanly in one page |
| A–C | Optional appendices | 3 pages maximum | Full endpoint catalogue, redacted deployment evidence, and expanded ERD only; do not duplicate main-report content |

The minimum viable document is **14 numbered pages** if the references fit in one page and the system-description table fits on one page. Do not compress the architecture below five pages: this section carries five of the document’s ten marks and must preserve legible operation-level diagrams.


### Cover page

Include:

- **RMIT Society — Cloud Solution Architecture**
- Assessment name, course, student details, and submission date.
- Report version and architecture-snapshot date.
- Optional clean product screenshot; do not use a dense cloud diagram on the cover.

### 1. Project links

Keep this to half a page.

| Item | Final value |
| --- | --- |
| Live application | `<verified deployed URL>` |
| Source repository | `https://github.com/klenathan/ASM3` |
| Architecture source files | Repository paths for editable diagram sources |
| Public dataset | State “No public dataset; deterministic user-generated demonstration data” unless a public dataset is actually used |
| Deployment environment | AWS Academy Learner Lab, `us-east-1` |

Do not insert the live URL until it has been browser-verified. Do not claim a public dataset merely because the application has seeded demo data.

### 2. Summary

Target length: one paragraph, approximately 150–200 words.

State:

- The problem: student discussion is fragmented across general-purpose and informal channels.
- The product: an RMIT-only community forum with societies, threads, comments, voting, media, location-tagged threads, reporting, moderation, and administration.
- The cloud objective: user actions automatically invoke appropriate AWS services across compute, containers, storage, networking, database, and analytics.
- The audience: students, society moderators, and system administrators.
- The outcome: a browser-accessible end-to-end system with demonstrable role-specific workflows.

### 3. Introduction

Target length: one page.

#### 3.1 Motivation

Explain the need for a campus-specific discussion space with institutional access boundaries, society-scoped moderation, and auditable handling of reports and content state.

#### 3.2 High-level product view

Describe the main product model:

- A **Society** is an RMIT community, equivalent to a subreddit.
- A **Thread** is a post inside a society.
- Students can join societies, create threads/comments, vote, attach media, attach a verified location, and report content.
- Moderators have authority only through active membership in the relevant society.
- System administrators are the only globally elevated role and can use the administration and analytics workflows.

#### 3.3 Beneficiaries

| Beneficiary | Benefit |
| --- | --- |
| Students | RMIT-specific discussion, discovery, and collaboration in relevant societies |
| Society moderators | Scoped moderation queue, member controls, and traceable decisions |
| System administrators | User/society governance and interpretable aggregated activity reporting |

**Figure 1 — Product roles and client operations.** Show Student, Moderator/Society Admin, and System Admin connected to their primary browser operations. This figure is a reader orientation aid, not a cloud diagram.

### 4. Related work

Target length: one to one-and-a-half pages.

The aim is comparative analysis, not a feature list or marketing argument. Use three short subsections and a comparison table.

#### 4.1 Community discussion platforms

Compare Reddit and Discourse with RMIT Society on community boundaries, threaded discussion, voting/reputation, and moderation. Establish that RMIT Society reuses familiar community-discussion concepts while constraining its audience and moderator authority to the RMIT context.

#### 4.2 Institution-oriented communication platforms

Compare Piazza and one institution-oriented platform such as CampusGroups only when a reliable source is cited. Explain that these systems demonstrate institution-oriented participation but are more course Q&A or organisation-management focused than a general society/thread forum.

#### 4.3 RMIT Society differentiation

Explain the project-specific combination of:

- configurable approved RMIT email-domain registration;
- society-scoped moderation authority;
- direct S3 media uploads with metadata held separately in PostgreSQL;
- verified Mapbox place attachment to threads;
- optional asynchronous content-analysis workflow;
- privacy-conscious action-event analytics and aggregate administrative reporting.

**Table 1 — Related-work comparison.**

| Related work | Demonstrated pattern | Limitation relative to this project | RMIT Society design response |
| --- | --- | --- | --- |
| Reddit | Community/subreddit structure, voting, volunteer moderation | No RMIT-specific access boundary or society-membership-derived authority | Restrict the product audience and determine moderation authority through society membership |
| Discourse | Structured long-form discussions and moderation/trust concepts | General-purpose community deployment | Focus on RMIT societies and AWS-integrated application workflows |
| Piazza | Institution-oriented academic discussion | Course/Q&A emphasis | Support broader society threads, media, reporting, and moderation |
| CampusGroups or equivalent | Student organisation and institution membership | Organisation-management orientation | Provide a discussion-first community model with explicit thread, vote, and report flows |

Every factual claim about a comparator must be cited to an official product or documentation source. Do not claim that RMIT Society is superior; identify scope and design differences.

### 5. System architecture

Target length: four to six pages. This is the report’s highest-value section.

#### 5.1 Architecture reading guide

Start with an operation coverage table. The assessor must be able to locate the full invocation path for every client operation without interpreting a single giant diagram.

| Client operation | Actor | Architecture figure |
| --- | --- | --- |
| Register, sign in, refresh session, sign out | Student | Figure 3 |
| Browse societies, feeds, threads, and comments | Visitor or Student | Figure 3 |
| Join/leave society; create/edit/delete thread or comment; vote | Student | Figure 3 |
| Request, upload, complete, and attach media | Student | Figure 4 |
| Search, select, and persist a verified thread location | Student | Figure 4 |
| Submit report; review and decide report | Student, Moderator | Figure 5 |
| Request content reanalysis | Moderator | Figure 5 |
| Request, monitor, and view analytics refresh | System Admin | Figure 6 |

Use a consistent legend in every architecture figure:

- Solid arrows: synchronous request or response.
- Dashed arrows: asynchronous message, scheduled trigger, or orchestration transition.
- Numbered arrows: ordered operations; use the number in the figure caption/legend.
- AWS boundary: `AWS Cloud — us-east-1`.
- External-service boundary: Mapbox and OpenRouter.
- Feature-gated components: visually distinct and labelled with their actual deployment status.

#### 5.2 Figure 2 — Deployment and component overview

Purpose: orient the reader to component placement and responsibilities. Do not use this figure as the sole operation-flow evidence.

Show the primary path:

```text
Browser SPA
  -> Amplify Hosting
  -> /api/* rewrite
  -> API Gateway HTTP API
  -> ECS backend service on one EC2 container instance
  -> RDS PostgreSQL
```

Show the backend’s direct supporting services:

```text
ECS backend -> Secrets Manager
ECS backend -> S3 media bucket
ECS backend -> ECR image source
ECS backend -> CloudWatch logs
```

Show separate bounded regions for asynchronous optional workflows:

```text
Content analysis:
ECS worker -> SQS reanalysis queue -> Lambda -> OpenRouter
Lambda -> private S3 media object access

Analytics:
Admin Center / EventBridge -> ECS backend -> Step Functions
Step Functions -> Glue -> private analytics S3 and Glue Data Catalog
Step Functions -> Athena -> analytics workflow Lambda -> RDS
```

Every component box must contain a one-line functional label. Example: “API Gateway — public HTTPS API entry point and proxy to ECS.”

The current reference overview is `infras/rmit_society_aws_architecture.png`. Simplify it for the report rather than shrinking the existing dense diagram until labels become unreadable.

#### 5.3 Figure 3 — Core authentication and community request flow

Purpose: show all synchronous standard browser operations.

```text
1. Browser SPA requests an application/API operation.
2. Hosting rewrites /api/* to API Gateway.
3. API Gateway proxies the request to ECS.
4. ECS applies Hono route, session middleware, controller, application service, domain policy, repository port, and Drizzle repository.
5. The repository reads/writes RDS PostgreSQL in a transaction when required.
6. The response returns through API Gateway to the browser.
```

Inside the ECS backend box, show the dependency flow once:

```text
HTTP route -> Controller -> Application service -> Repository port
           -> Drizzle repository -> PostgreSQL
```

Call out that this is a domain-oriented modular monolith, not a collection of independently deployed microservices. The architectural rationale is one deployable backend with explicit module boundaries, lower operational cost, and simpler transaction handling.

#### 5.4 Figure 4 — Media upload and verified location flow

Use a sequence diagram with two labelled lanes.

**Media lane:**

```text
1. Student requests upload authorisation from the SPA.
2. ECS authorises the request and creates pending media metadata in RDS.
3. ECS returns a presigned S3 upload URL.
4. Browser uploads the binary directly to S3.
5. Browser confirms completion through the API.
6. ECS changes the media state to ready and attaches it to the thread.
```

State that media binaries are stored in S3; RDS stores metadata and object keys only.

**Location lane:**

```text
1. Student searches/selects a place in the location UI.
2. ECS calls Mapbox Places through the places adapter.
3. The student submits the selected Mapbox identifier with the thread.
4. ECS retrieves and verifies the selected place before persistence.
5. ECS stores the verified name, Mapbox ID, place type, latitude, and longitude with the thread.
```

State that the backend re-verifies the submitted identifier and does not trust arbitrary browser coordinates.

#### 5.5 Figure 5 — Moderation and content-analysis flow

Show the report and decision path:

```text
Student -> SPA -> API Gateway -> ECS -> RDS report/moderation records
Moderator -> SPA -> API Gateway -> ECS -> society membership/role check -> RDS decision and audit state
```

Make the authorization distinction explicit:

- Moderator authority is derived from active membership in the relevant society.
- `system_admin` is the global elevated role.

Show content reanalysis only if enabled in the environment:

```text
Moderator -> SPA -> API Gateway -> ECS
  -> SQS reanalysis queue
  -> ECS worker long-polls SQS
  -> content-analysis Lambda
  -> private S3 media object access
  -> OpenRouter inference API
  -> ECS/RDS content-analysis and moderation state
```

If disabled, label this path “implemented optional pipeline” and state why it is not current live evidence.

#### 5.6 Figure 6 — Analytics refresh and reporting flow

Show the analytics architecture as a dedicated operation sequence:

```text
1. System Admin requests a bounded UTC date-range refresh in Admin Center,
   or EventBridge invokes the authenticated scheduler endpoint.
2. ECS creates one durable analytics refresh run in RDS.
3. ECS starts a Standard Step Functions execution with range-scoped input.
4. Step Functions invokes Glue to export action events, memberships, and votes to private S3.
5. Glue Catalog exposes the Parquet export as external tables.
6. Athena runs activity, current-state, and reconciliation queries in parallel.
7. The analytics workflow Lambda validates results and persists metric rows in RDS.
8. The Admin Center reads the resulting metrics through the ECS API and renders tables/charts.
```

Explain beside the figure:

- Ranges use inclusive-start/exclusive-end UTC semantics.
- Step Functions owns waiting, retries, timeouts, and fan-in; ECS does not poll Glue or Athena.
- Actor identity in action events is an HMAC pseudonym, not a direct user identifier.
- Metric classes are activity, current state, and reconciliation.

The repository infrastructure documentation identifies analytics as feature-gated. Do not claim Step Functions, Glue, Athena, EventBridge, or the analytics Lambda as live assessment evidence until the entire client-to-metric path has been deployed and demonstrated.

### 6. System descriptions

Target length: one-and-a-half to two pages.

Use the following responsibility table. Remove or relabel a row if the corresponding service is not actually deployed in the final environment.

| Category | Component | Purpose and invocation |
| --- | --- | --- |
| Client | React/Vite SPA | Browser interface for student, moderator, and administrator operations |
| Hosting | Amplify Hosting | Serves the SPA and rewrites `/api/*` requests to API Gateway |
| Networking | API Gateway HTTP API | Public HTTPS API entry point and proxy to the ECS backend |
| Containers | Amazon ECS | Runs backend and worker containers |
| Compute | Amazon EC2 | Supplies ECS container-instance capacity for the coursework deployment |
| Image registry | Amazon ECR | Stores backend and database-bootstrap container images |
| Database | Amazon RDS for PostgreSQL | Authoritative transactional and aggregate application persistence |
| Storage | Amazon S3 | Stores uploaded media and analytics export artefacts |
| Messaging | Amazon SQS | Decouples reanalysis work from the browser request |
| Serverless compute | AWS Lambda | Runs the content-analysis adapter and analytics workflow persistence handler |
| Orchestration | AWS Step Functions | Coordinates analytics export/query execution, retry, wait, and fan-in |
| Analytics ETL | AWS Glue | Exports data and catalogs Parquet datasets |
| Analytics query | Amazon Athena | Queries analytics datasets using SQL |
| Scheduling | Amazon EventBridge | Starts scheduled analytics refreshes |
| Secrets | AWS Secrets Manager | Provides runtime secrets without committing them to source code |
| Observability | Amazon CloudWatch | Retains API, ECS, and Lambda logs |
| Third-party places | Mapbox | Searches and retrieves place data used to verify thread locations |
| Third-party inference | OpenRouter | Provides enabled image/content-analysis inference |

For every final row, add a sentence linking the service to a visible client operation or automatic service-to-service invocation. This prevents a component-purpose table from becoming a generic AWS glossary.

### 7. Datasets, data structures, and APIs

Target length: two pages.

#### 7.1 Data origin and classification

| Data set/source | Origin | Storage | Privacy and retention position |
| --- | --- | --- | --- |
| Accounts, profiles, societies, memberships, threads, comments, votes, reports | User-generated product data | RDS PostgreSQL | Access-controlled by session, ownership, membership, and role policy |
| Media objects | User uploads | S3 | Store binary objects in S3; retain metadata and object keys in RDS |
| Location snapshots | Mapbox place retrieval | Thread fields in RDS | Persist only verified place metadata relevant to the thread |
| Action events | Derived from transactional product state changes | RDS, then private analytics S3 during refresh | Use HMAC actor pseudonyms and a bounded raw-event retention period |
| Aggregate analytics metrics | Glue/Athena query results | `analytics_action_metrics` in RDS | Administrative aggregate reporting |
| Content-analysis requests/results | Moderator-requested analysis, when enabled | RDS/S3/Lambda workflow as applicable | Do not publish model credentials, private object URLs, or raw secret values |

#### 7.2 Figure 7 — Simplified logical data model

Use an ERD that shows relationships and selected invariants, rather than every physical column:

```text
User --< SocietyMembership >-- Society
Society --< Thread --< Comment
Thread --< ThreadVote
Comment --< CommentVote
Thread --< ThreadMedia >-- MediaAsset
Thread / Comment --< Report --< ModerationAction
User and content changes --< ActionEvent --> AnalyticsActionMetric
```

Call out these invariants:

- Application-generated UUID identifiers and UTC timestamps.
- Vote values constrained to `-1` or `1`.
- Moderator authority derived from society membership.
- Soft deletion/status transitions preserve moderation evidence.
- Media records contain an object key, never a presigned/delivery URL.
- A persisted location must include the required verified Mapbox identifier and coordinate fields together.

#### 7.3 API catalogue

Do not paste every endpoint into the main report. Group endpoints by client operation.

| API group | Representative operations | Consumer |
| --- | --- | --- |
| Authentication | Register, sign in, session refresh, sign out | SPA |
| Societies | Browse, inspect, join/leave, manage membership | SPA |
| Discussions | Create/list/read/update/delete threads/comments; vote | SPA |
| Media | Request upload, confirm upload, attach asset | SPA; S3 direct-upload flow |
| Moderation | Submit report, inspect queue, make decision, request reanalysis | SPA |
| Places | Search, retrieve, reverse geocode | SPA through ECS backend |
| Analytics v2 | Query metrics; create, cancel, inspect refresh | Admin Center |
| Scheduled analytics | Start scheduled refresh | EventBridge only; not browser-facing |

State the API boundary: the browser communicates with the ECS backend through API Gateway. It does not directly access RDS, Secrets Manager, Glue, Athena, or other private services.

#### 7.4 Third-party API contracts

Include short source-cited descriptions:

- **Mapbox:** place search/retrieval; the backend verifies the selected place before the thread stores its snapshot.
- **OpenRouter:** enabled content-analysis inference invoked by Lambda; credentials are obtained at runtime from Secrets Manager and private S3 media is accessed through temporary URLs.

### 8. References

Target length: one to two pages.

Use IEEE citation style consistently. Build a working bibliography in these groups before numbering the final list:

1. **Related work:** official Reddit, Discourse, Piazza, and any institution-oriented platform documentation cited in Section 4.
2. **AWS services:** official documentation for every AWS service named in the final deployed architecture.
3. **Frameworks and implementation technologies:** React, Vite, Hono, Drizzle ORM, PostgreSQL, where their use is discussed.
4. **Third-party APIs:** Mapbox and OpenRouter documentation.
5. **External code, data, icons, models, diagrams, or ideas:** every externally sourced asset or implementation aid actually used.

Cite a source in the surrounding prose or figure caption whenever it supports an external factual claim. References must be traceable, not a list of unused URLs.

## Diagram production specification

### General rules

- Use one visual language across all figures: same AWS icons, typeface, arrow labels, line weights, and colour roles.
- Put each figure title and number directly below the graphic.
- Include a short caption explaining what the figure proves.
- Use legible text at normal document zoom; never reduce an oversized diagram until labels are unreadable.
- Show boundaries: browser/client, AWS region, VPC where useful, external services, and private data services.
- Label arrows with an operation, protocol, or data type, such as `HTTPS /api/*`, `SQL`, `presigned PUT`, `SQS message`, `Parquet export`, or `Athena SQL query`.
- Number multi-step interactions in the flow diagrams.
- Each component must have a function label either inside the diagram or in the immediately adjacent legend.
- Keep editable sources in the repository and put rendered image assets used by the document into `doc_images/` in the final submission package.

### Recommended diagram set

| Figure | Type | Question answered |
| --- | --- | --- |
| Figure 1 | Role/use-case diagram | Which user role invokes which client operation? |
| Figure 2 | Deployment/component overview | Where does each component run and what is its purpose? |
| Figure 3 | Core request sequence | How do standard web/community operations reach the backend and database? |
| Figure 4 | Two-lane sequence | How do media and verified location operations invoke S3 and Mapbox? |
| Figure 5 | Moderation/event sequence | How do reports, moderator decisions, and optional content analysis proceed? |
| Figure 6 | Analytics orchestration sequence | How does an admin refresh invoke EventBridge/ECS/Step Functions/Glue/Athena/Lambda/RDS? |
| Figure 7 | Simplified ERD | What are the main domain entities, relationships, and invariants? |

## Evidence pack required before final writing

Collect a small evidence register while deploying and rehearsing the demo. Redact secrets and sensitive identifiers.

| Claimed capability | Required evidence | Final report use |
| --- | --- | --- |
| SPA hosting and API routing | Browser screenshot and successful authenticated API workflow | Project links, Figure 2, demo |
| ECS/EC2 backend execution | ECS service/task state and redacted CloudWatch evidence | Figure 2, component table |
| RDS persistence | Visible create/read/update product workflow and redacted database/task evidence | Figures 3–5, data section |
| S3 media path | Upload, retrieval, and browser-visible attachment | Figure 4, demo |
| Mapbox location verification | Create a thread with one verified location and display it | Figure 4, API section |
| Moderator boundary | Student report plus moderator decision within one society | Figure 5, demo |
| Content analysis | Enqueue, process, persist, and display outcome when enabled | Figure 5, component table |
| Analytics pipeline | Refresh request, durable status, Glue output, Athena queries, persisted metric, displayed table/chart | Figure 6, analytics narrative |
| Observability | Redacted log-group names or relevant execution evidence | Component table, appendix if needed |

## Final consistency checklist

Before export to PDF:

- [ ] The live URL and repository URL are correct.
- [ ] Every AWS service named as deployed is actually provisioned and exercised.
- [ ] Every client operation in the role/use-case figure appears in the architecture operation-coverage table and at least one flow diagram.
- [ ] Every arrow in the architecture diagrams has a clear direction and meaningful label.
- [ ] Every component in a figure has a purpose statement.
- [ ] The hosting service shown matches the live environment; no planned infrastructure is presented as deployed.
- [ ] The analytics section accurately reflects whether the feature-gated pipeline is enabled and demonstrated.
- [ ] The report explains the direct browser-to-S3 media upload path and backend-controlled upload authorisation.
- [ ] The report explains that Mapbox identifiers are server-verified before thread location persistence.
- [ ] The report explains society-scoped moderator authority and the distinct `system_admin` role.
- [ ] The data section contains a simplified ERD, classification table, API catalogue, and key invariants.
- [ ] Every related-work comparison and external technology claim has an IEEE in-text citation.
- [ ] References include only sources actually cited or used.
- [ ] All report images are copied into `doc_images/` for the final submission ZIP.
- [ ] No credentials, private keys, secret values, environment-file contents, full ARNs, database URLs, or presigned URLs appear in the report or submitted images.

## Repository evidence used to prepare this plan

- `docs/assessment/ASSESSMENT_3.md` — mandatory report sections, architecture-diagram requirements, submission layout, and IEEE expectation.
- `docs/backend-architecture/BACKEND_ARCHITECTURE.md` — backend dependency flow, bounded contexts, authorization model, data conventions, and logical-schema baseline.
- `docs/analytics/README.md` — analytics v2 API, Step Functions/Glue/Athena/Lambda workflow, privacy properties, and verification path.
- `infras/README.md` — active deployment topology, feature gates, component responsibilities, and publishing contract.
- `infras/rmit_society_aws_architecture.png` — existing AWS architecture visual to simplify and reuse only as supporting reference.
- `docs/architecture/MODERNIZATION_PLAN.md` — confirms Elastic Beanstalk hosting is proposed rather than current, and documents report/diagram modernization work still pending.
