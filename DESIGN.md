# DESIGN.md — commonroom

## Visual world: Student Society Membership

Red-led, modern, dark + light. The campus is treated as a **membership club**: joins stamp an orange-red mark onto your member card, each space/club is a board of flyers, and moderation is a reviewer stamping a lanyard badge — never a glowing alarm system.

This world replaces the legacy CloudPulse scaffold. Product behavior, moderation states, tenant isolation and feeds still follow `PRODUCT.md`; only the visual grammar changed.

## Committed directions

- **Red-led modern:** RMIT orange-red (`--stamp`) is the single committed accent. It owns the primary action per view (join, upvote, post, sign in), the member mark, and the moderation REVIEW stamp.
- **Dual scene, not category-picked:** light = membership desk / midday campus (`paper` background). dark = club room / after hours (`graphite` background). Persisted per user via the `next-themes` toggle in the header.
- **Print grammar:** offset-registration strip on each post flyer, ticket-perforation ring on membership elements, condensed display lettering (`Roboto Condensed`), editorial grotesk body (`Inter`), bordered "stamp" chips. Reads bred print culture, not collage.
- **Type:** body `Inter Variable`; display/headings `Roboto Condensed Variable` via the `font-display` utility and `--font-display` token. Tracking clamped to `-0.01em`.

## Tokens

Defined in `apps/web/src/index.css` (`:root` light, `.dark` club-room).

- `--stamp` / `--stamp-foreground`: the orange-red commitment and its on-color text.
- `--paper` / `--ink`: membership-desk surface and ink text.
- Standard shadcn semantic tokens (background, card, popover, foreground, muted, secondary, accent, destructive, border, input, ring, sidebar*) are tuned to warm/hairline values per scene.
- `--radius: 0.5rem`; card radii ~`rounded-md`; pills reserved for small badges.
- Shadows carry offset + blur; dark uses a 1px top highlight instead of a deep drop shadow.

## Surfaces (described in the confirmed shape brief)

1. **Entry / onboarding (`/`)**: Persuade-lite. Identity splash (verified RMIT membership), a foil member-card hero that rises in, and a "stamp your card" space picker. Entering requires at least one space to avoid an empty common room.
2. **Feed (`/feed`)**: Operate. Composer + feed of flyer posts (offset stripe, state stamp, upvote). Author's non-`APPROVED` posts are surfaced in their own "in review" group with explicit state — never optimistically inserted into the public feed.
3. **Post detail (`/post/:id`)**: threaded replies (bounded depth in MVP), reply composer, upvote.
4. **Space board (`/space/:id`)**: space header as a club card plus its approved/flagged flyers.
5. **Moderation console (`/moderation`)**: dark-first fused skin regardless of scene. Hairline graphite, gated reveal for flagged/high-risk content, orange-red REVIEW stamp, action buttons by outcome (approve/flag/reject). Never reveals thresholds or raw provider output.
6. **Layout**: left rail = spaces, center = content, mobile-first with condensed boards.

## Moderation-state language (UI-visible only to authors)

- `PENDING` · CHECKING (amber, pulsing dot)
- `FLAGGED` · IN REVIEW
- `REJECTED` / `FAILED` (red stamp)

Threat levels and labels in the review desk are illustrative fixture data; production values come from configured thresholds and normalized provider output, per `PRODUCT.md`.

## Current status

Direction brief confirmed and surfaces implemented (entry, feed, post detail, space, moderation, profile, notifications, reports & appeals, design tokens, dark/light).

### Data layer (TanStack Query)

Frontend talks to the RMIT Society API contract through a typed fetch client:

- `src/lib/api/types.ts` mirrors backend Pydantic models (User, Society, Post, Comment, Report, Appeal, Notification, moderation records).
- `src/lib/api/client.ts` wraps `fetch` with base URL (`VITE_API_BASE_URL`, default `http://localhost:8000/api/v1`) and an `Authorization: Bearer` header.
- `src/lib/api/endpoints.ts` maps each backend route to a typed call.
- `src/lib/api/queries.ts` exposes `useQuery`/`useMutation` hooks for feeds, posts, comments, societies, users, notifications, reports, appeals, and the moderation queue.
- `src/auth/auth-provider.tsx` is a token stub that injects the bearer header; wired into `main.tsx`. No live Cognito flow yet.

Pages render loading / empty / error states until the backend is reachable — no mock or hardcoded fixture content remains in `apps/web` (the old `src/lib/data.ts` was removed). Derived display values (author initials, avatar hue, space mark) come from real API `User`/`Society` data via `src/lib/model.ts`, with a safe fallback for unresolved authors.

### Remaining gaps

- **Live wiring + auth:** the fetch client and provider are in place but not exercised against a running backend; the Cognito sign-in/sign-up flow and token refresh are not implemented. Set `VITE_API_BASE_URL` and supply a token via `setToken` to go live.
- **Media upload:** composer "attach image" button and the presigned upload/media-access flow are not wired.
- **Author/society resolution:** feeds return posts with id-only references; a batch user lookup is not available, so unresolved authors show a derived fallback card.
- **Moderation desk:** risk labels/thresholds, report context, appeals decisions are driven by the API contract; label fixtures still illustrative pending configured thresholds per `PRODUCT.md`.
