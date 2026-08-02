# Auth handoff

Frontend intentionally contains **no mock user, forum types, sample threads, or route guards** yet.

## Existing foundation

- `react-router-dom` installed; route tree not implemented.
- `@tanstack/react-query` provider configured in `src/main.tsx`.
- Dark/light theme provider configured through `next-themes`.
- App defaults to dark theme. Theme tokens live in `src/index.css`.

## Next agent: auth boundary

1. Add API-backed `AuthProvider` under `src/features/auth/`.
2. Keep session token handling out of localStorage when backend supports secure HTTP-only cookies.
3. Create public `/sign-in` route and protected parent route with `ProtectedLayout` plus `Outlet`.
4. Redirect unauthenticated visitors to `/sign-in`, preserving intended destination.
5. Enforce authorization on backend too. Frontend guards are UX only.
6. Make approved RMIT email domains environment-configured; do not hard-code AU, VN, or EU domain values until confirmed.

## Intended protected route shape

```text
/sign-in                         public
/                                ProtectedLayout → forum feed
/s/:societySlug                  ProtectedLayout → society
/thread/:threadId                ProtectedLayout → thread
/submit                          ProtectedLayout → compose thread
/mod/*                           role-gated moderator routes
/admin/*                         role-gated administrator routes
```

## API contracts still required

- Session: current user, sign in, sign out, refresh.
- User role: student, moderator, admin.
- Society-scoped moderator assignments.
- Thread, comment, vote, report, and pagination payloads.
- Error response format and authorization failure behavior.
