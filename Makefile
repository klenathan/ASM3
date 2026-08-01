# RMIT Society — host development checks and real AWS deployment targets.

STAGE ?= dev
AWS_REGION ?= ap-southeast-2
AWS_PROFILE ?=
AWS_ACCOUNT_ID ?=
BACKEND_IMAGE ?=
WORKER_IMAGE ?=
WEB_DIST ?= apps/web/dist

AWS_ARGS = --stage $(STAGE) --region $(AWS_REGION)
ifneq ($(strip $(AWS_PROFILE)),)
AWS_ARGS += --profile $(AWS_PROFILE)
endif
ifneq ($(strip $(AWS_ACCOUNT_ID)),)
AWS_ARGS += --expected-account-id $(AWS_ACCOUNT_ID)
endif

.PHONY: bootstrap deploy dev-backend web-build lint test fe-check

## Provision AWS foundations and print immutable ECR repository URIs.
bootstrap:
	cd backend && uv run python ../infra/deploy.py $(AWS_ARGS)

## Reconcile full AWS stack and publish built SPA. Images must use release tags/digests.
deploy:
	@test -n "$(BACKEND_IMAGE)" || (echo "BACKEND_IMAGE is required" && exit 2)
	@test -n "$(WORKER_IMAGE)" || (echo "WORKER_IMAGE is required" && exit 2)
	@test -d "$(WEB_DIST)" || (echo "WEB_DIST does not exist: $(WEB_DIST)" && exit 2)
	cd backend && uv run python ../infra/deploy.py $(AWS_ARGS) \
		--backend-image "$(BACKEND_IMAGE)" \
		--worker-image "$(WORKER_IMAGE)" \
		--web-dist "../$(WEB_DIST)"

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
