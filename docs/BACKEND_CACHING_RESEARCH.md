# Backend caching

Status: recommended design, not yet implemented  
Date: 2026-08-03  
Scope: RMIT Society Node.js/Hono modular monolith on ECS/EC2 with PostgreSQL on RDS

## Decision

Do **not** add Redis, Valkey, ElastiCache, or API Gateway REST caching for the MVP.

Use this order:

1. Measure endpoint and SQL latency.
2. Reduce duplicate browser requests with TanStack Query freshness settings.
3. Define safe HTTP cache headers and conditional requests.
4. Separate public representations from personalized overlays so shared caching is safe.
5. Add a bounded application cache only if load tests show a database bottleneck.
6. Add ElastiCache for Valkey only when the application has multiple backend tasks or measured load requires a shared cache.

This order fits the coursework constraints: one `t3.micro` EC2 host, one ECS task limited to 384 MiB, one `db.t4g.micro` RDS instance, low cost, and a reliable demo.

If ElastiCache is explicitly approved, follow the conditional Serverless Valkey design in the [ElastiCache for Valkey](#elasticache-for-valkey) section below.

## Current-state findings

- API Gateway uses an **HTTP API** (`infras/api.tf`). AWS HTTP APIs do not provide API Gateway response caching; that feature belongs to REST APIs.
- Amplify proxies `/api/*` to API Gateway (`infras/amplify.tf`). Amplify can honor origin `Cache-Control`, but rewritten API behavior must be verified before relying on it as a shared edge cache.
- Amplify's default cache key excludes cookies. This is safe only when API responses containing cookie-derived data are marked `private` or `no-store`.
- Authentication uses the `rmit_session` cookie and also accepts bearer tokens.
- Society discovery can include caller membership data. Thread, comment, and feed DTOs include caller-specific vote or authorization-dependent retained content.
- Public society details and rules are currently the clearest shared-cache candidates.
- TanStack Query is present, but global queries have no `staleTime`; its default therefore treats cached queries as stale.
- No backend `Cache-Control` or `ETag` policy exists. `backend/README.md` intentionally describes API responses as non-cacheable.
- PostgreSQL and its operating system already cache database pages. That is not an application result cache and should be measured before adding another data layer.
- S3 object keys are UUID-based and therefore suitable for immutable object caching, but the API currently generates one-hour signed download URLs and upload requests do not set object `Cache-Control` metadata.

## Goals

- Lower repeat-read latency and RDS work.
- Preserve authorization, moderation, suspension, sign-out, and vote correctness.
- Keep deployment cheap and understandable.
- Accept bounded staleness only for explicitly public data.
- Make cache behavior testable and observable.

## Recommended layers

| Layer                                 | MVP decision                         | Reason                                                                                 |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| PostgreSQL/RDS page cache and indexes | Use                                  | Already present; no application invalidation burden                                    |
| TanStack Query browser cache          | Use now                              | No infrastructure cost; existing dependency                                            |
| Browser HTTP cache and validators     | Use now                              | Standards-based; low complexity                                                        |
| Amplify shared edge cache             | Use only for proven-public responses | Cookie cache key excludes cookies by default                                           |
| API Gateway stage cache               | Reject                               | Current HTTP API does not support it; changing to REST adds cost and complexity        |
| In-process Node cache                 | Defer                                | 384 MiB task; cache is lost on restart and diverges across future tasks                |
| ElastiCache for Valkey                | Defer                                | Added service, network, cost, failure mode, metrics, and invalidation work             |
| Redis on coursework EC2 host          | Reject                               | Competes with API for small-host memory and creates an unmanaged single failure domain |

## HTTP response policy

Start with a fail-safe default and override only reviewed routes.

| Response class                                                      | Suggested header                                                             | Examples                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Authentication, session, admin, moderation, reports, presigned URLs | `Cache-Control: no-store`                                                    | sign-in, `/auth/me`, moderation queue, media upload/download URL            |
| Personalized reads                                                  | `Cache-Control: private, no-cache`                                           | home feed, my societies, user activity, thread/comments containing `myVote` |
| Public but changeable reads                                         | `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60` | society detail and society rules                                            |
| Immutable content-addressed assets                                  | `Cache-Control: public, max-age=31536000, immutable`                         | only objects whose URL changes whenever bytes change                        |
| Mutations and errors                                                | `Cache-Control: no-store`                                                    | POST, PUT, PATCH, DELETE, authorization/validation errors                   |

`no-cache` permits storage but requires revalidation. `no-store` prohibits storage. They are not interchangeable.

Add `ETag` to public society and rule representations. Return `304 Not Modified` for matching `If-None-Match`. ETags reduce response transfer; they do not remove origin/database work unless a browser or shared cache can serve a still-fresh response.

### Required representation split

Do not shared-cache a URL whose response changes by user, membership, role, vote, suspension state, or visibility permission.

Current society discovery mixes public society data with optional membership data. Prefer:

- public society discovery response, identical for every caller; and
- separate authenticated membership overlay, cached privately by TanStack Query.

Apply the same pattern only if discussion caching becomes necessary:

- shared public thread/comment projection; and
- private caller vote/permission overlay.

Until split, keep discovery and discussion responses `private` or `no-store`. Do not solve this with `Vary: Cookie`: Amplify excludes cookies from its cache key by default, including them fragments the cache, and cookie-based variants remain easy to misconfigure.

### Public-route authentication overhead

Public society detail and rule handlers do not use a principal, but broad society middleware still authenticates a supplied cookie. Register authentication middleware only on routes that need optional or required identity. This removes session/account database reads from truly public cacheable routes and makes public response semantics easier to prove.

## TanStack Query policy

Configure freshness per data volatility rather than one long global value.

| Query                        | Initial `staleTime` | Invalidation                                    |
| ---------------------------- | ------------------: | ----------------------------------------------- |
| Society detail and rules     |           5 minutes | society/rule mutation success                   |
| Society discovery            |          60 seconds | create/join/leave/update success                |
| Thread detail and comments   |       15–30 seconds | thread/comment/vote mutation success            |
| Home and society feeds       |       15–30 seconds | thread/comment/vote mutation success            |
| Current user and memberships |       30–60 seconds | auth/profile/join/leave/admin state change      |
| Moderation/admin queues      |                   0 | explicit mutation invalidation or short polling |

The frontend already performs targeted invalidation and optimistic vote updates. Preserve those patterns. A nonzero `staleTime` avoids mount/reconnect refetches while data is fresh; default inactive-query garbage collection remains five minutes unless changed deliberately.

## Application result cache design

If measurements justify backend caching, add domain-specific cache ports rather than importing Redis or a cache library into services or domain models.

```text
Controller → query service → read-cache port → infrastructure adapter
                           ↘ repository port → PostgreSQL
```

Use cache-aside for read projections:

1. Read versioned key.
2. On hit, return projection.
3. On miss, query repository and populate cache with TTL.
4. After a successful database mutation, invalidate or advance the affected version.
5. Treat cache failure as a miss; PostgreSQL remains source of truth.

Suggested initial candidates:

| Data                               | Cache?       |           TTL | Invalidation                                               |
| ---------------------------------- | ------------ | ------------: | ---------------------------------------------------------- |
| Society by slug                    | Yes          |     5 minutes | society create/update/archive                              |
| Rules by society                   | Yes          |     5 minutes | rule create/update/delete                                  |
| Public profile identity            | Maybe        |      1 minute | profile/admin update                                       |
| First page of public society feed  | Maybe later  | 15–30 seconds | short TTL or society feed generation                       |
| Cursor pages                       | Usually no   |             — | invalidation fan-out is high                               |
| Session principal                  | No initially |             — | revocation and suspension correctness                      |
| Membership/moderator authorization | No           |             — | stale permission can grant forbidden access                |
| Votes and `myVote`                 | No           |             — | high churn and caller-specific values                      |
| Moderation/admin/report data       | No           |             — | sensitive and correctness-critical                         |
| Presigned S3 URLs                  | No           |             — | credentials expire and must not leak through shared caches |

Cache stable DTO/projection data, not Drizzle rows, ORM objects, or HTTP responses. Keep authorization checks outside cached public projections.

Do not cache the repository globally. Authorization paths also read societies; stale society status must not permit a forbidden mutation. Cache only explicit public read projections.

### Key and reliability rules

- Prefix keys with schema version and environment: `rmit:demo:v1:society:slug:<slug>`.
- Bound memory and entry count for any in-process adapter.
- Add TTL jitter (10–20%) to reduce simultaneous expiry.
- Coalesce concurrent misses for the same key to prevent stampedes.
- Negative-cache `not found` only for a few seconds when useful.
- Never place secrets, raw session tokens, passwords, presigned URLs, or private profile data in shared cache values.
- Do not make a database transaction depend on cache availability.
- Invalidate only after the database transaction commits.
- Log cache operation failures without returning them to clients.

### Resilience

Cache is an optimization, not dependency.

- After repeated timeout/connection failures, bypass cache for 30 seconds; allow one probe after cooldown; continue serving from RDS.
- Never enqueue unbounded cache writes; cap serialized value size, initially 64 KiB.
- Use TTL on every application key; if invalidation fails, TTL bounds staleness for public data.
- Prevent cache stampedes with per-process single-flight loading. Distributed locks are unnecessary for a one-task, idempotent read cache.

## ElastiCache for Valkey

Chosen only when the [adoption gate](#elasticache-adoption-gate) below is met. If approved, use **Amazon ElastiCache Serverless for Valkey** as an optional cache-aside layer.

Initial scope:

- cache only public society detail and society rules;
- use Valkey GLIDE's cluster-aware Node.js client;
- use TLS and password-based Valkey RBAC;
- deploy VPC endpoints into existing private database subnets;
- permit ports 6379 and 6380 only from the ECS security group;
- cap Serverless usage at 1 GB and 1,000 ECPUs/second;
- keep PostgreSQL authoritative and bypass cache on every cache failure;
- disable snapshots because cached data is disposable;
- leave sessions, permissions, feeds, votes, reports, and moderation data uncached.

ElastiCache remains optional. Backend must run correctly when `CACHE_ENABLED=false` or ElastiCache is unavailable.

### Why Serverless Valkey

| Option | Fit | Decision |
|---|---|---|
| ElastiCache Serverless for Valkey | Low minimum storage charge, managed scaling, three-AZ redundancy, 99.99% SLA | **Recommended** |
| One `cache.t4g.micro` Valkey node | Simple cluster-mode-disabled client, predictable fixed capacity, but single-node availability and higher baseline cost | Fallback |
| Replicated node-based Valkey | Stronger availability and predictable capacity, but at least two paid nodes | Too expensive for MVP |
| Redis OSS | Higher ElastiCache pricing than Valkey without project benefit | Reject |
| Memcached | No Valkey data structures/RBAC path and less useful future capability | Reject |
| Redis/Valkey on existing EC2 | Competes with API on `t3.micro`; unmanaged failure and patching | Reject |

AWS documents Serverless as always TLS-encrypted, cluster-mode enabled, asynchronously replicated across three Availability Zones, and covered by a 99.99% availability SLA. Cluster mode requires a cluster-aware client and care with multi-key commands.

### Cost

Prices below were queried from AWS Price List API on 2026-08-03. Estimates use 730 hours/month and exclude taxes, snapshots, unusual transfer, and workload-dependent request volume.

| Deployment | us-east-1 | ap-southeast-2 |
|---|---:|---:|
| Serverless Valkey minimum 100 MB storage | about **US$6.13/month** | about **US$7.37/month** |
| Serverless 1 million 1 KB operations | **US$0.0023** | **US$0.0027** |
| One `cache.t4g.micro` Valkey node | about **US$9.34/month** | about **US$14.02/month** |

Calculations:

- us-east-1 Serverless storage: `0.1 GB × $0.084/GB-hour × 730 = $6.132`;
- Sydney Serverless storage: `0.1 GB × $0.101/GB-hour × 730 = $7.373`;
- us-east-1 node: `$0.0128/hour × 730 = $9.344`;
- Sydney node: `$0.0192/hour × 730 = $14.016`.

Valkey Serverless meters at least 100 MB even when less data is stored. Each command consumes ECPUs based on bytes and CPU; a simple request transferring up to 1 KB generally consumes one ECPU. Demo traffic makes storage minimum the likely dominant charge.

Recheck target-region prices immediately before deployment. Add a budget alert and destroy cache after assessment demo.

### Architecture

```text
Browser
  → Amplify
  → API Gateway HTTP API
  → ECS task on existing EC2 host
      ├─ PostgreSQL repository → RDS (source of truth)
      └─ cache port → TLS → ElastiCache Serverless for Valkey
                           ├─ VPC endpoint in private subnet AZ-a
                           └─ VPC endpoint in private subnet AZ-b
```

Existing network already supplies:

- ECS and ElastiCache in same VPC;
- two private database subnets in separate Availability Zones;
- direct VPC-local routing without a NAT Gateway;
- ECS security group usable as ElastiCache ingress source.

Use DNS endpoint exported by ElastiCache. Never persist underlying IP addresses because AWS can replace them.

#### Security group

Create dedicated `aws_security_group.cache`:

- ingress TCP 6379 from `aws_security_group.ecs.id`;
- ingress TCP 6380 from `aws_security_group.ecs.id`;
- no public CIDR ingress;
- normal outbound rule.

Serverless uses 6379 for primary endpoint and 6380 for reader endpoint. AWS notes some clients attempt both during connection establishment even when replica reads are not enabled.

Do not expose ElastiCache through API Gateway, an Elastic IP, SSH tunnel, NAT port forwarding, or public subnet route.

#### Backend client

Use `@valkey/valkey-glide` with `GlideClusterClient` because Serverless accepts only cluster-mode clients. Create one client per Node process and reuse its multiplexed connections.

Required client behavior:

- TLS enabled with certificate validation;
- endpoint DNS and both supported ports;
- RBAC username/password;
- finite request timeout, initially 100–200 ms for cache commands;
- exponential reconnect backoff with jitter;
- bounded in-flight requests;
- error events logged without password, values, or personal data;
- graceful close before database pool shutdown;
- no replica reads initially, avoiding read-after-write staleness;
- no `SELECT`, cross-slot multi-key transaction, or cross-slot Lua operation.

GLIDE has native components. Verify Node 22 and `node:22-bookworm-slim` image compatibility, image size, startup, and memory within the 384 MiB ECS task. If it fails this gate, evaluate `redis` `createCluster` as fallback rather than weakening network or TLS controls.

### Authentication

#### MVP: password RBAC

Use one Valkey user and one user group:

- engine: `valkey`;
- username: environment-specific backend identity;
- key pattern: only project/environment prefix;
- commands: only connection, cluster discovery, and cache read/write/expiry operations;
- 32+ character generated password;
- password stored in Secrets Manager and injected as ECS secret;
- TLS required.

Password RBAC is recommended over IAM authentication for this milestone because it avoids SigV4 token generation, 15-minute token refresh, and 12-hour connection re-authentication. It matches the project's existing Secrets Manager approach for `DATABASE_URL`.

Suggested ACL intent, to validate against selected client commands in AWS integration tests:

```text
on ~rmit-society:<environment>:* -@all +@read +@write +@connection -@dangerous +cluster|slots +cluster|shards
```

Do not use `on ~* +@all` or passwordless users. Exact ACL must be tested because cluster clients can use different discovery commands.

#### Future: IAM authentication

IAM authentication removes the long-lived password but adds:

- IAM-enabled ElastiCache user;
- `elasticache:Connect` permission for both cache and user ARNs;
- SigV4 token generation;
- token refresh before 15-minute expiry;
- connection re-authentication before AWS's 12-hour disconnect.

Adopt only after client support and LabRole permissions are proven. AWS Academy Learner Lab blocks normal role creation, so IAM auth would need least-privilege policy on existing LabRole.

### Infrastructure-as-code

Add `infras/cache.tf` containing these resources:

```hcl
resource "aws_security_group" "cache" {
  # VPC-local ingress from ECS SG on 6379 and 6380 only
}

resource "random_password" "cache" {
  length  = 32
  special = false
}

resource "aws_elasticache_user" "backend" {
  engine        = "valkey"
  user_id       = "${local.name}-backend"
  user_name     = "${local.name}-backend"
  access_string = "<reviewed least-privilege ACL>"

  authentication_mode {
    type      = "password"
    passwords = [random_password.cache.result]
  }
}

resource "aws_elasticache_user_group" "backend" {
  engine        = "valkey"
  user_group_id = "${local.name}-backend"
  user_ids      = [aws_elasticache_user.backend.user_id]
}

resource "aws_elasticache_serverless_cache" "backend" {
  engine               = "valkey"
  name                 = "${local.name}-cache"
  major_engine_version = "8"
  description          = "Disposable backend read cache"
  subnet_ids            = aws_subnet.database[*].id
  security_group_ids    = [aws_security_group.cache.id]
  user_group_id         = aws_elasticache_user_group.backend.user_group_id
  snapshot_retention_limit = 0

  cache_usage_limits {
    data_storage {
      maximum = 1
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = 1000
    }
  }
}
```

Provider and region availability must be confirmed by `tofu plan`; exact engine major should be a reviewed variable rather than silently following latest. Current AWS engine discovery returned Valkey 7.2, 8.0, 8.1, 8.2, 9.0, and 9.1 in both us-east-1 and ap-southeast-2 on 2026-08-03.

Store password in an `aws_secretsmanager_secret` and inject it into ECS. Add non-secret endpoint settings to task environment:

```text
CACHE_ENABLED=true
CACHE_HOST=<serverless endpoint address>
CACHE_PORT=<serverless endpoint port>
CACHE_USERNAME=<RBAC username>
CACHE_TLS=true
CACHE_KEY_PREFIX=rmit-society:<environment>:v1
```

Inject only `CACHE_PASSWORD` through ECS `secrets`. Never place it in environment examples, outputs, logs, image layers, or source.

OpenTofu's encrypted remote state still contains generated secrets under the current pattern. Terraform 1.11+ supports write-only ElastiCache passwords, but project compatibility and OpenTofu support must be verified before using that feature.

#### AWS Academy deployment gate

Before implementation:

1. Update local AWS CLI; current installed CLI 2.13.21 predates Serverless ElastiCache commands.
2. Confirm LabRole/account allows Serverless cache, user, user-group, security-group, service-linked-role, and VPC endpoint operations.
3. Run `tofu plan` before creating resources.
4. Apply cache resources in a disposable environment first.
5. Record teardown command and verify cache deletion.

Do not replace Serverless with a public or self-hosted cache if Learner Lab denies it. Fall back to no distributed cache or approved `cache.t4g.micro` node.

### Backend module boundaries for the cache adapter

Preserve module boundaries:

```text
Controller → SocietyService → SocietyQueryCache port
                         └──→ SocietyRepository port → Drizzle → RDS

SocietyQueryCache port → ValkeySocietyQueryCache adapter → GLIDE → ElastiCache
```

Suggested files:

```text
backend/src/
├── config/env.ts
├── shared/infrastructure/cache/
│   ├── key-value-cache.ts
│   ├── valkey-key-value-cache.ts
│   └── noop-key-value-cache.ts
└── modules/societies/
    ├── application/society-query-cache.ts
    └── infrastructure/valkey-society-query-cache.ts
```

Application/domain code must not import Valkey GLIDE or AWS SDK. Composition root creates concrete adapter and injects typed cache port.

#### Configuration behavior

- `CACHE_ENABLED=false` by default locally and in tests.
- Cache variables become required only when enabled.
- Invalid partial configuration fails startup.
- Cache connection failure does **not** fail application startup.
- Readiness remains based on required dependencies, currently RDS. Optional cache failure must not remove healthy API task from service.
- Expose cache status through metrics/logging, not public health response internals.

### Cache-aside algorithm (Valkey)

For public society detail:

```text
GET cache key
  hit + valid JSON → return cached DTO
  miss/error/corrupt value → query RDS → return DTO → best-effort SET with TTL
```

For rules, same flow with society-specific key.

On successful rule create/update/delete:

```text
commit PostgreSQL transaction
  → best-effort delete rules key
  → return mutation result regardless of cache deletion outcome
```

Rules:

- PostgreSQL remains source of truth.
- Cache writes/invalidation happen after database commit.
- Cache failure becomes miss, never API 5xx.
- Cache timeout must be shorter than normal database fallback latency budget.
- Do not retry cache commands repeatedly inside request path.
- Validate cached JSON; delete corrupt values and treat as miss.
- Add 10–20% TTL jitter to avoid synchronized expiry.
- Coalesce same-process concurrent misses for one key.
- Do not negative-cache initially.

#### Keys and TTLs

```text
rmit-society:<env>:v1:society:slug:<normalized-slug>   TTL 300s ± jitter
rmit-society:<env>:v1:society:<society-id>:rules      TTL 300s ± jitter
```

Keep each operation single-key. Serverless is cluster-mode enabled; unrelated keys can occupy different hash slots and multi-key commands can fail with `CROSSLOT`. If atomic multi-key operations are introduced later, use deliberate hash tags such as `{society:<id>}` and document hot-key risk.

#### Explicit exclusions

Do not cache:

- session token or authenticated principal;
- account suspension/deactivation status;
- membership or moderator authorization;
- optional membership fields in society discovery;
- `myVote`, votes, scores, home feeds, or cursor pages initially;
- private profile activity;
- reports, moderation queues/actions, or admin data;
- presigned S3 upload/download URLs;
- errors or mutation responses.

These values are user-specific, high-churn, security-sensitive, or expensive to invalidate correctly.

### Observability and alarms

Application metrics/log fields:

- `cache.operation`: get/set/delete;
- `cache.result`: hit/miss/error/bypass/corrupt;
- cache command duration;
- fallback database duration;
- key category only, never complete user-controlled key or value.

CloudWatch Serverless metrics:

- `CacheHitRate`, `CacheHits`, `CacheMisses`;
- `SuccessfulReadRequestLatency`, `SuccessfulWriteRequestLatency`;
- `BytesUsedForCache`, `CurrItems`, `Evictions`;
- `ElastiCacheProcessingUnits`, `ThrottledCmds`;
- `CurrConnections`, `NewConnections`;
- `AuthenticationFailures`, `KeyAuthorizationFailures`, `CommandAuthorizationFailures`.

Initial alarms:

- authentication or authorization failures greater than zero;
- `ThrottledCmds` greater than zero for sustained period;
- evictions sustained before expected 1 GB cap;
- cache hit rate below 60% after representative warm traffic;
- application cache error rate above 5% for five minutes.

AWS recommends alarming near 75% of configured Serverless usage limits.

### ElastiCache adoption gate

Choose ElastiCache for **Valkey** only when at least one condition is demonstrated:

- backend scales beyond one ECS task and needs a coherent shared cache;
- load tests show repeated read queries are the RDS bottleneck after query/index tuning;
- a target cache workload is expected to achieve a useful hit ratio, initially at least 70%; or
- a separate requirement needs distributed coordination, rate limiting, or short-lived shared state.

Before adoption, record:

- baseline and cached p50/p95/p99 endpoint latency;
- SQL calls and database time per endpoint;
- RDS CPU, connections, read latency, and slow queries;
- cache hit/miss ratio, evictions, memory, command latency, and error rate;
- stale-data window and invalidation behavior;
- monthly cost and teardown procedure.

For this small workload, provisioned and serverless pricing must be compared in the target AWS region. ElastiCache Serverless for Valkey meters at least 100 MB plus request ECPUs; “serverless” does not mean zero idle cost.

## Media caching

Current infrastructure makes the S3 bucket publicly readable but the backend still returns signed GET URLs. Choose one delivery model explicitly:

1. **Public forum media:** return a stable object URL and set object `Cache-Control` metadata during upload. Use UUID keys and never overwrite bytes at the same key.
2. **Private media:** keep bucket private and use short-lived signed URLs; cache neither URL response nor authorization decision.

Do not use a one-year immutable TTL if moderation requires immediate removal from caches. Pick a shorter public TTL or add a controlled CDN invalidation workflow. Direct CloudFront is unnecessary until Amplify/S3 delivery cannot meet a measured requirement.

## Tests and rollout

### Unit/service tests

- cache hit avoids repository read;
- cache miss queries repository and stores DTO;
- malformed cached JSON falls back safely;
- timeout/error falls back to repository;
- successful mutation invalidates after commit;
- invalidation failure does not fail committed mutation;
- TTL and key prefix are correct;
- no secrets or cached values enter logs.

### Integration tests

- run local Valkey container for adapter command and TTL behavior;
- run AWS smoke test for TLS, RBAC, cluster discovery, 6379/6380 security rules, and ACL commands;
- verify a second fake user cannot access project keys;
- verify backend serves responses while cache endpoint is blocked;
- verify `CROSSLOT` is avoided;
- verify graceful shutdown closes client.

### Performance acceptance

Use seeded society detail/rules traffic and compare cache disabled/enabled:

- warm hit rate at least 70%;
- lower RDS query count and database time;
- improved or unchanged p95 response latency;
- no backend memory breach under 384 MiB;
- zero cross-user data leakage;
- zero mutation correctness regression.

If hit rate remains below 60% or latency does not improve, remove ElastiCache. Extra AWS service without measured benefit conflicts with project cost rules.

### Verification and deployment order

1. Add endpoint duration and database-query timing without logging SQL parameters or personal data.
2. Load test representative seeded workflows before any cache:
   - public society detail/rules;
   - society discovery;
   - authenticated home feed;
   - thread plus comments;
   - vote and comment mutations.
3. Capture baseline latency and RDS metrics.
4. Add TanStack `staleTime`, HTTP policy, and public/private response split.
5. Repeat identical tests and compare request count, latency, and database work.
6. Inspect production responses through Amplify for `Cache-Control`, `Age`, `ETag`, `304`, and cache-status headers. Never assume the rewrite is cached.
7. Run cross-user tests proving one user's membership, vote, private profile, moderation visibility, or session data is never served to another user.

For the ElastiCache path specifically:

1. Add cache interfaces, no-op adapter, tests, and config behind `CACHE_ENABLED=false`.
2. Add GLIDE adapter and local integration tests.
3. Add OpenTofu resources in disposable environment.
4. Validate TLS/RBAC from ECS, not from public internet.
5. Enable only society detail/rules.
6. Run load and failure tests.
7. Add dashboard/demo evidence showing automatic `CacheHits`, `CacheMisses`, and reduced RDS reads.
8. Keep rollback as one task-definition change: `CACHE_ENABLED=false`.

## Demo path

To prove automatic AWS invocation:

1. Clear or wait for society cache key expiry.
2. Open society page: first request produces ElastiCache miss and RDS read.
3. Refresh/revisit society page: subsequent request produces ElastiCache hit.
4. Update a society rule as moderator: backend commits RDS change and deletes rules key.
5. Reload rules: miss loads updated rules, then later request hits.
6. Show CloudWatch `CacheHits`, `CacheMisses`, command latency, and application request IDs.

Never expose cache credentials or key values in assessment evidence.

## Sources

Primary references accessed 2026-08-03:

- AWS, **Choose between REST APIs and HTTP APIs** — HTTP APIs list caching as unsupported: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
- AWS, **Cache settings for REST APIs in API Gateway**: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html
- AWS Amplify, **Using the Cache-Control header to increase app performance**: https://docs.aws.amazon.com/amplify/latest/userguide/Using-headers-to-control-cache-duration.html
- AWS Amplify, **Managing cache key cookies** — default excludes cookies: https://docs.aws.amazon.com/amplify/latest/userguide/cache-key-cookies.html
- AWS, **Database Caching Strategies Using Redis** — cache-aside and write-through: https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html
- AWS, **Amazon ElastiCache pricing**: https://aws.amazon.com/elasticache/pricing/
- AWS, **ElastiCache deployment options**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.deployment.html
- AWS, **Role-Based Access Control**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html
- AWS, **Authenticating with IAM**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth-iam.html
- AWS, **In-transit encryption**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html
- AWS, **Accessing ElastiCache**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/accessing-elasticache.html
- AWS, **Serverless troubleshooting and cluster-mode requirements**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/wwe-troubleshooting.html
- AWS, **Scaling ElastiCache Serverless**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Scaling-serverless.html
- AWS, **Serverless metrics and events**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/serverless-metrics-events-redis.html
- AWS, **Client best practices**: https://aws.amazon.com/blogs/database/best-practices-valkey-redis-oss-clients-and-amazon-elasticache/
- AWS, **Supported node types**: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html
- HashiCorp AWS provider, **`aws_elasticache_serverless_cache`**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_serverless_cache
- HashiCorp AWS provider, **`aws_elasticache_user`**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_user
- Valkey GLIDE, **Node.js client**: https://github.com/valkey-io/valkey-glide/blob/main/node/README.md
- Valkey GLIDE, **AWS IAM integration**: https://glide.valkey.io/how-to/security/iam-integration-using-aws-sdk/
- MDN, **Cache-Control** — public/private/no-cache/no-store and stale directives: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- MDN, **HTTP conditional requests** — ETag, `If-None-Match`, and `304`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests
- TanStack Query, **Important defaults**: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- PostgreSQL, **Resource consumption** — `shared_buffers` and OS cache: https://www.postgresql.org/docs/current/runtime-config-resource.html
- AWS RDS, **Monitor slow SQL queries with Database Insights**: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DatabaseInsights.SlowSQL.html
