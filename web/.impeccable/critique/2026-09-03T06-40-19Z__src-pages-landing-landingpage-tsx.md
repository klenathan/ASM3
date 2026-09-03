---
target: homepage and admin page
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-03T06-40-19Z
slug: src-pages-landing-landingpage-tsx
---
## Design Health Score

Combined score for the landing page, authenticated forum homepage composition, and admin center: **28/40 — Good**, with clear weaknesses in help, efficiency, and operational prioritization.

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading, error, empty, retry, refresh, and mutation states are present; share failures are silent and refresh scope is not persistent. |
| 2 | Match System / Real World | 3 | Society/thread/member language fits; “Issue 01,” EMR/Glue/Athena, and “platform keys” require interpretation. |
| 3 | User Control and Freedom | 3 | Dialog cancellation, filters, retry, and sign-out work; no undo for high-impact changes and no clear-filters action. |
| 4 | Consistency and Standards | 3 | Shared tokens/primitives/focus rings are consistent; “Status” vs “System health” and “Config” vs “Platform config” drift. |
| 5 | Error Prevention | 3 | Confirmations and disabled pending states help; free-form config input has no visible validation and admin actions are one-row-at-a-time. |
| 6 | Recognition Rather Than Recall | 3 | Headings and labels are clear; icon-only row actions, “Issue 01,” and infrastructure terms add interpretation cost. |
| 7 | Flexibility and Efficiency | 2 | Search, filters, refresh, and pagination/infinite feed exist; no bulk actions, saved views, keyboard shortcuts, date filters, or analytics export. |
| 8 | Aesthetic and Minimalist Design | 4 | Editorial landing composition, rules, type, and signal orange are disciplined; admin’s seven peer sections and dense tables strain minimalism. |
| 9 | Error Recovery | 3 | Plain retry and alert states are common; clipboard failure has no feedback and mutation errors can expose raw/transient messages. |
| 10 | Help and Documentation | 1 | No visible help, glossary, eligibility explanation, moderation guidance, or analytics definitions. |

## Design Specificity Verdict

The visual world is distinct and authored: warm publication-paper neutrals, red-orange signal color, Oswald display type, Geist body type, ruled borders, index/issue vocabulary, and an asymmetric editorial grid. This is stronger than a generic community app. Product specificity drops in the authenticated feed and admin center, where conventional feed rows, shadcn-style tables, tabs, cards, and charts dominate.

Landing evidence: `src/index.css:53-90` and `src/pages/landing/LandingPage.tsx:30-109`. Forum evidence: `src/pages/forum/ForumPage.tsx:10-36`, `src/features/feed/home-feed.tsx:70-138`. Admin evidence: `src/pages/admin/AdminPage.tsx:17-54` and `src/features/admin/admin-nav.tsx:17-75`.

Deterministic detector found **0 static findings** across the reviewed markup targets. Browser overlay injection succeeded on the root route and reported one rendered anti-pattern: `layout-transition` (`transition: height`); it provided no source location. The live backend was unavailable during an un-stubbed browser pass: `localhost:3000/api/v1/auth/me` failed CORS, so the real route rendered the offline fallback. Supplemental browser previews with local auth/data stubs rendered the intended landing page and admin users view; those previews are visual evidence only, not backend verification.

## Overall Impression

A confident editorial shell with a credible red-orange identity. The landing page looks intentional immediately, but it asks visitors to admire the metaphor before understanding the product. The admin surface is visually coherent yet operationally flat: seven equal destinations compete with urgent work, and the default Users view does not communicate why it should come first. The single biggest opportunity is to turn the brand’s “index” metaphor into clearer entry and triage paths instead of decorative language and peer navigation.

## What's Working

- **Strong authored foundation.** Centralized warm-paper tokens, signal orange, Oswald/Geist typography, rules, and uppercase metadata create a recognizable system across surfaces.
- **Landing hierarchy.** One dominant headline, three-item index, eligibility copy, and asymmetric two-column composition produce a calm low-noise first viewport on desktop and mobile.
- **State/accessibility intent.** HomeFeed and admin sections include skeletons, `role="status"`/`role="alert"`, empty states, retry actions, focus-visible rings, labelled searches/menus, disabled pending actions, and destructive confirmation dialogs.

## Priority Issues

### [P1] The landing value proposition is atmospheric before useful

**Why it matters:** “Make room for better conversations” does not quickly tell a first-time student what they can find or do. “Society,” “thread,” and approved identity language are not concretely explained. Equal-weight Create account and Sign in choices delay the first-time path.

**Fix:** Lead with “Find and join RMIT societies and campus threads,” show 2–3 real/example societies or thread snippets, explain eligibility inline, and make Create account clearly primary while retaining Sign in as secondary. Use `$impeccable clarify` and `$impeccable layout`.

### [P1] Landing index rows look interactive but are not

**Why it matters:** `LandingPage.tsx:89-104` renders rows as non-interactive `div`s while adding hover background and arrow translation. Visitors will reasonably click “Find a society” or “Join the thread” and receive no response; keyboard users cannot reach them.

**Fix:** Make each row a real `Link` to the appropriate destination with focus styling, or remove hover/arrow affordances and label the list as informational. Use `$impeccable clarify`.

### [P1] Admin navigation lacks an operate-mode priority model

**Why it matters:** Users must choose among Users & roles, Moderation, Content review, Status, Audit trail, Config, and Analytics before seeing urgent work. The default Users view is not obviously the most time-sensitive destination. The mobile strip repeats the seven-way scan in a clipped horizontal scroller.

**Fix:** Group sections under People, Trust & safety, and Platform; surface counts/alerts for open reports, content requiring review, and degraded health; default to an overview or work queue. Keep navigation responsive without exposing seven equal peers. Use `$impeccable distill` and `$impeccable layout`.

### [P1] Failure feedback is not consistently visible or recoverable

**Why it matters:** `DiscussionCard` catches clipboard errors and resets state without feedback (`thread-card.tsx:31-41`). High-impact admin changes have confirmation but no undo or durable change record in context. Raw/transient mutation errors weaken operator confidence.

**Fix:** Add an inline/live-region share result with manual-copy fallback, preserve failed form input, translate API failures into plain-language next steps, and link role/config/deactivation success to an audit entry or provide undo where safe. Use `$impeccable harden`.

### [P2] Feed and admin data views make discovery/comparison harder

**Why it matters:** The feed relies on an invisible intersection sentinel and has no explicit end state or scope control. Admin tables are dense on mobile; the users table clips the Suspended status in a 390px preview. Analytics offers four charts without date scope, last-updated context, comparison, export, or plain-language definitions.

**Fix:** Add explicit feed scope/sort/filter and an end-of-feed state; keep discovery reachable before or alongside mobile feed content; use responsive priority columns/cards; add analytics date scope, last refreshed text, comparison, export, and metric definitions. Use `$impeccable adapt` and `$impeccable harden`.

## Cognitive Load

- **Landing:** Low. One clear hero, one three-item index, and two entry actions. Decision cost rises because the copy is abstract and the index appears actionable.
- **Forum:** Moderate. Top search, Society Index, feed, vote/comment/share actions, and an invisible infinite-scroll boundary compete for attention.
- **Admin:** Moderate-high. Seven simultaneous peer destinations exceed the preferred four-item grouping; users/reports tables present 5–7 columns plus hidden row actions. Analytics presents four equal charts without scope disclosure.

Checklist: single-focus passes on landing and individual admin sections; admin chunking/minimal-choice fails; grouping and basic hierarchy pass; progressive disclosure passes for audit payloads and destructive row actions but not analytics scope.

## Emotional Journey

- **Landing:** Arrival feels confident and intentional. The valley is the abstract promise and lack of concrete community proof. Eligibility copy reassures but repeats instead of building trust with examples or a clear next step.
- **Forum:** “The forum is open” creates invitation; discovery and participation controls are present. Empty state is warm and actionable, but feed scope/end-state and share feedback are weak.
- **Admin:** Role-gated “Admin center” establishes authority. Skeletons, retries, confirmations, and refresh controls reassure. Seven equal destinations and technical analytics language create an infrastructure feel; no urgent-work overview means the operator starts without a clear priority.

## Persona Red Flags

- **Jordan — confused first-timer:** Abstract hero; “society,” “thread,” and approved-identity terminology lack examples/help; equal CTAs; decorative index rows are not actionable.
- **Casey — distracted mobile user:** Seven-option horizontal admin scroller requires scanning; top-bar search competes for compact space; Society Index moves below main content on mobile, delaying discovery.
- **Alex — impatient power user:** No overview, keyboard shortcuts, saved views, bulk selection, batch moderation, analytics date filters, or export; row actions are one user/report at a time.
- **Sam — accessibility-dependent user:** ARIA naming, heading structure, alerts, and focus intent are good; muted text/tiny uppercase metadata need explicit WCAG contrast verification; chart values are mainly visual/tooltip-driven; clipboard failure is not announced.

## Minor Observations

- Landing footer repeats approved-email/unofficial-space reassurance already shown beside the CTAs; use that space for privacy/trust information.
- “Today / Issue 01” is unexplained and appears static; establish a durable issue system or use “Updated today.”
- TopBar has no persistent Home/Societies link; users infer SocietyIndex or use search.
- Admin navigation uses nav/button/`aria-current` rather than a tablist model; either is valid, but the interaction model should be explicit.
- Analytics chart containers have labels, but exact values/trends are not equivalently available as text.
- Status/audit should show “last checked” timestamps.

## Questions to Consider

- What should a new visitor understand in five seconds: where RMIT students find societies, why this threaded forum is safer, or both?
- Is the landing Index intended as a real three-step entry path, or only a visual manifesto? If it is a path, where should each row go?
- Is the admin’s primary job urgent trust/safety triage or account management? What evidence should determine the default screen?
- Is “Issue 01” a durable product metaphor, or should operate-mode surfaces use plainer operational language?
