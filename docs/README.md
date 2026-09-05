# RMIT Society documentation

Use this index instead of treating every historical design note as an installation guide. Operational instructions are deliberately separated from architecture, research, and planning records.

## Start here

| Goal | Document |
| --- | --- |
| Run the product locally | [Repository README](../README.md#local-development) |
| Configure and deploy to AWS | [Deployment and operations](deployment/README.md) |
| Understand provisioned AWS resources | [Infrastructure README](../infras/README.md) |
| Package the Assessment 3 submission | [Assessment guide](assessment/ASSESSMENT_3.md#submission-packaging) |
| Understand backend boundaries and data model | [Backend architecture](backend-architecture/BACKEND_ARCHITECTURE.md) |
| Build or operate action analytics | [Analytics](analytics/README.md) |
| Operate content analysis or re-analysis | [Content analysis](content-analysis/) |

## Documentation by domain

### Delivery and assessment

- [Deployment and operations](deployment/README.md) — prerequisites, AWS access, initial deployment, updates, gated features, verification, cost control, and teardown.
- [Assessment 3](assessment/ASSESSMENT_3.md) — Canvas-submission requirements extracted from the brief, including the final ZIP layout.
- [Architecture](architecture/) — deployment and modernization design records.

### Application architecture

- [Backend architecture](backend-architecture/BACKEND_ARCHITECTURE.md) — modular-monolith boundaries, domain model, schema, and implementation conventions.
- [Analytics](analytics/README.md) — administrator action-event metrics and the Glue/Athena workflow.
- [Content analysis](content-analysis/) — OpenRouter/Lambda content analysis and SQS re-analysis documentation.
- [Admin center](admin-center/ADMIN_CENTER_PLAN.md) — system-admin planning record.

### Project process

- [Agent issue tracker](agents/issue-tracker.md)
- [Triage labels](agents/triage-labels.md)
- [Domain documentation conventions](agents/domain.md)

## Documentation rules

- Installation, configuration, deployment, verification, and teardown instructions belong in [deployment](deployment/README.md).
- Product-specific operational details belong in the owning feature folder.
- Architecture, research, plans, and backlogs record decisions and context; they do not override the deployment guide.
- Do not put secrets, credentials, account identifiers, database URLs, private keys, or unredacted AWS command output in documentation.
