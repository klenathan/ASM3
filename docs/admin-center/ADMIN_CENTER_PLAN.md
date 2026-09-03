# System Admin Center — Plan & TODO

Status: **Plan only** (design agreed; implementation follows in a later pass).
Last reviewed: 2026-08-03

## Scope

A system-wide **Admin Center** for `platform_role = system_admin`, reached from a new **Admin** entry in the topbar avatar dropdown (gated on role). It stays **separate** from the society-scoped Settings moderation tab. Visitor mode: **Operate** (dense, task-completion admin console), structurally mirroring the Settings page.

Five sections are in scope:

1. Users & roles (buildable now — needs a new list/search backend endpoint)
2. Moderation & reports (buildable now via existing `/api/v1/mod/*`)
3. System health & status (needs new backend endpoint)
4. Platform config (needs new backend endpoint)
5. Analytics (implemented as the action-event v2 dashboard; see `../analytics/README.md`)

## TODO

### Route, guard, and entry point

- [ ] Add a system-admin role guard (only authentication is guarded today in `web/src/app/ProtectedLayout.tsx`).
- [ ] Register a new `/admin` route as a sibling of `/settings` in `web/src/app/routes.tsx`, wrapped in the admin guard.
- [ ] Add a conditional **Admin** entry (Shield icon) to the avatar `DropdownMenu` in `web/src/components/site/TopBar.tsx:23-30`, shown only when `user.platformRole === "system_admin"`.
- [ ] Route non-admin visitors to `403 ForbiddenPage`; ensure the Admin topbar entry is absent for non-admins.

### Admin page shell

- [ ] Create `features/admin/admin-sections.ts` metadata array (mirrors `features/settings/settings-sections.ts`): id / label / heading / icon / blurb / pending per section.
- [ ] Create `pages/admin/AdminPage.tsx` composing a desktop nav rail + mobile tab strip (mirrors `features/settings/settings-nav.tsx`).
- [ ] Add components/site/admin-nav equivalents matching the angular `rounded-none`, uppercase `font-heading`, red-orange `--primary` active-state conventions.
- [ ] Compose one section component per tab under `features/admin/`; keep unbuilt sections as visible `pending` tiles (mirrors `features/settings/pending-section.tsx`).

### Users & roles

- [ ] Add `features/admin/api.ts` using the shared `request()` wrapper from `lib/http.ts` for suspend / deactivate / set-role calls.
- [ ] Implement searchable user directory (needs new backend list/search endpoint; per-user actions `/api/v1/admin/users/{id}/suspend|deactivate`, `PATCH .../role` already exist).
- [ ] Row actions: suspend / deactivate / change role; destructive actions behind `alert-dialog` confirmation.
- [ ] Status shown as words/icons + color (active / suspended / deactivated); feedback via Sonner toasts.

### Moderation & reports

- [ ] Build global escalation queue (system-wide) — claim / resolve / dismiss via existing `/api/v1/mod/*`.
- [ ] Add resolved-history view; each report shows status, claimed-by / owner, and resolution outcome.
- [ ] Keep this distinct from the society-scoped Settings moderation tab (not built this milestone).

### System health & status

- [ ] Read-only platform health overview (needs new or reused backend endpoint).
- [ ] Loading skeleton + inline `ApiError` banner states.

### Platform config

- [ ] Manage RMIT email domain allow-list and config keys (needs new backend endpoint).

### Analytics

- [x] Action-event analytics dashboard, bounded refresh, and durable run status.

### Shared states & constraints

- [ ] Empty, loading, error, and permission states across all sections (matches Settings handling).
- [ ] Reuse existing shadcn primitives: `table`, `tabs`, `dialog`, `alert-dialog`, `badge`, `switch`, `select`, `dropdown-menu`.
- [ ] Tests: component tests for role-gating and mutation error states (per `docs/MVP_BACKLOG.md` P0).

## Open decisions

- [ ] Backend user-directory list/search endpoint (required for Users & roles).
- [ ] Exact platform-config keys to ship.
- [x] Scope resolved: action-event metrics at platform, society, and content grain.
