# RMIT Society — host development checks and real AWS deployment targets.

STAGE ?= dev
AWS_REGION ?= us-east-1
AWS_PROFILE ?=
AWS_ACCOUNT_ID ?=
BACKEND_IMAGE ?=
WEB_DIST ?= apps/web/dist
MESSAGE ?= "migration"
N ?= 1
ENV_FILE ?= .env
TOFU ?= tofu
TFVARS ?= terraform.tfvars

.PHONY: bootstrap deploy infra-init infra-fmt infra-validate infra-plan infra-apply infra-destroy aws-whoami db-generate db-migrate db-downgrade db-stamp dev-backend web-build lint test fe-check

WITH_AWS_ENV = set -a; test -f "$(ENV_FILE)" || { printf '%s\n' "Missing $(ENV_FILE). Copy .env.example and add AWS credentials." >&2; exit 1; }; . "$(ENV_FILE)"; set +a;

## Show the AWS identity loaded from .env.
aws-whoami:
	@$(WITH_AWS_ENV) aws sts get-caller-identity

## Initialize OpenTofu providers.
infra-init:
	@$(WITH_AWS_ENV) $(TOFU) -chdir=infra init

## Format OpenTofu files.
infra-fmt:
	@$(TOFU) -chdir=infra fmt -recursive

## Validate the OpenTofu configuration.
infra-validate: infra-init
	@$(WITH_AWS_ENV) $(TOFU) -chdir=infra validate

## Preview infrastructure changes.
infra-plan: infra-validate
	@$(WITH_AWS_ENV) $(TOFU) -chdir=infra plan -var-file=$(TFVARS)

## Apply infrastructure changes.
infra-apply: infra-validate
	@$(WITH_AWS_ENV) $(TOFU) -chdir=infra apply -var-file=$(TFVARS)

## Destroy infrastructure. Use deliberately: make infra-destroy.
infra-destroy: infra-init
	@$(WITH_AWS_ENV) $(TOFU) -chdir=infra destroy -var-file=$(TFVARS)

## Backward-compatible deployment alias.
deploy: infra-apply

## Initialize local development tooling.
bootstrap: infra-init


## Generate a new Alembic revision by diffing models vs the live DB.
## Usage: make db-generate MESSAGE="add is_pinned flag"
db-generate:
	cd backend && uv run alembic revision --autogenerate -m "$(MESSAGE)"

## Apply Alembic migrations to the configured DATABASE_URL (e.g. RDS).
db-migrate:
	cd backend && uv run alembic upgrade head

## Roll back the most recent migration on the configured DATABASE_URL.
## Usage: make db-downgrade N=1  (or N=-3 to go back three)
db-downgrade:
	cd backend && uv run alembic downgrade $(N)

## Mark the DB at head without running any migrations (rare, for baselines).
db-stamp:
	cd backend && uv run alembic stamp head

## Run FastAPI directly on host. Use explicit test/dev environment variables.
dev-backend:
	cd backend && uv run uvicorn rmit_society.server:app --reload --app-dir src --port 8000

web-build:
	cd apps/web && pnpm build

lint:
	cd backend && uv run ruff check . && uv run mypy

test:
	cd backend && uv run pytest

fe-check:
	cd apps/web && pnpm lint && pnpm test && pnpm build
