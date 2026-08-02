# RMIT Society — web

Frontend foundation for RMIT-only society forum.

## Stack

- React 19 + Vite 8
- TypeScript 7 native Go compiler (`tsc`)
- Tailwind CSS 4 via `@tailwindcss/vite`
- shadcn/ui (Radix Nova preset, full component set generated)
- React Router 7
- TanStack Query
- `@tanstack/markdown` for future thread rendering
- pnpm

## Commands

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm lint
pnpm preview
```

## Theme

`src/index.css` owns Tailwind 4 and shadcn tokens. `next-themes` starts dark by default and switches via the `.dark` selector.

## Current boundary

This commit deliberately contains no forum types, demo records, routes, or UI implementation. See [docs/HANDOFF_AUTH.md](docs/HANDOFF_AUTH.md) before adding protected routes and authentication.
