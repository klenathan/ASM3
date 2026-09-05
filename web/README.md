# RMIT Society web client

The web client is the RMIT Society React single-page application. It provides public forum pages, authenticated student workflows, society moderation, settings, and the system-admin center.

## Stack

- React 19, Vite 8, and TypeScript
- Tailwind CSS 4 with shadcn/ui primitives
- React Router 7
- TanStack Query
- `next-themes`
- pnpm

Feature code lives in `src/features/`, route-level composition in `src/pages/`, and providers/routing/guards in `src/app/`. Keep `src/App.tsx` as a thin shell. Design tokens are in `src/index.css`; the default theme is dark and uses the `.dark` selector.

## Run locally

Install dependencies, then start Vite:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Start the API from `../backend` first; the client defaults to `http://localhost:3000` when `VITE_API_URL` is unset.

To point the client at another API while developing, set the value only for that command:

```sh
VITE_API_URL=https://api.example.test pnpm dev
```

The deployed frontend does not call a separate API origin. The publishing script sets `VITE_API_URL` to the Amplify site origin, so browser requests use the same-origin `/api/*` rewrite to API Gateway.

## Commands

```sh
pnpm dev        # Vite development server
pnpm typecheck  # TypeScript validation
pnpm lint       # ESLint
pnpm build      # production browser build
pnpm preview    # serve the built output locally
pnpm test       # Vitest
```

## Deployment

Do not manually upload `dist/`. From the repository root, provision infrastructure first, then publish with:

```sh
make deploy-frontend
```

The command reads the Amplify application outputs, builds `web/`, creates a signed Amplify deployment, uploads the generated archive, and starts that deployment. Follow the [deployment guide](../docs/deployment/README.md) for first deployment, credentials, runtime verification, and teardown.

## Verification

Before publishing a frontend change, run the relevant local behavior, then:

```sh
pnpm typecheck
pnpm lint
pnpm build
```

For an AWS UI change, verify the actual published site in a browser after `make deploy-frontend`; static build success does not verify the configured API rewrite, authentication, or browser-visible behavior.
