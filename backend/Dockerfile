FROM node:22.23.1-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

FROM base AS development-dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS build
COPY --from=development-dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS rds-ca

ARG RDS_CA_BUNDLE_URL=https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
       "$RDS_CA_BUNDLE_URL" \
       --output /rds-global-bundle.pem \
  && test -s /rds-global-bundle.pem \
  && grep -q 'BEGIN CERTIFICATE' /rds-global-bundle.pem \
  && rm -rf /var/lib/apt/lists/*

FROM base AS database-bootstrap

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem

COPY --from=rds-ca /rds-global-bundle.pem /etc/ssl/certs/aws-rds-global-bundle.pem
COPY --from=development-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json drizzle.config.ts ./
COPY --chown=node:node src ./src
COPY --chown=node:node drizzle ./drizzle

USER node

# This target is run once by the ECS database-bootstrap task, never as a service.
CMD ["sh", "-c", "./node_modules/.bin/tsx src/db/migrate.ts && ./node_modules/.bin/tsx src/db/seed.ts"]

FROM node:22.23.1-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# AWS RDS CA roots are not guaranteed to exist in the base image trust store.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=rds-ca /rds-global-bundle.pem /etc/ssl/certs/aws-rds-global-bundle.pem

WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
