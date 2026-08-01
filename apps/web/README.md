# RMIT Society web

React 19 + TypeScript + Vite SPA. Production deploys to private S3 behind CloudFront and calls FastAPI through same-origin `/api/v1`.

## Host development

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` may point to host Uvicorn at `http://localhost:8000/api/v1`. Production builds omit this override.

## Checks and build

```sh
pnpm lint
pnpm test
pnpm build
```

`dist/` is uploaded by root `make deploy`; never edit generated output.
