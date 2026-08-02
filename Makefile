SHELL := /bin/sh

AWS ?= aws
TOFU ?= tofu
ENV_FILE ?= .env
INFRA_DIR := infras
BOOTSTRAP_DIR := $(INFRA_DIR)/bootstrap
BACKEND_KEY ?= demo/infrastructure.tfstate
STATE_BUCKET ?=
ARGS ?=
BACKEND_IMAGE_TAG ?= latest
TARGET_PLATFORM ?= linux/amd64

.DEFAULT_GOAL := help

.PHONY: help whoami bootstrap-init bootstrap-plan bootstrap-apply bootstrap-output bootstrap-tofu init plan apply destroy output validate fmt tofu deploy-frontend push-backend

define with_env
	@set -a; \
	if [ ! -f "$(ENV_FILE)" ]; then \
		printf 'Missing %s. Add AWS credentials before running this target.\n' "$(ENV_FILE)" >&2; \
		exit 1; \
	fi; \
	. "$(ENV_FILE)"; \
	set +a; \
	$(1)
endef

help:
	@printf '%s\n' \
		'Common targets:' \
		'  make whoami                          Verify AWS credentials from .env.' \
		'  make bootstrap-init|plan|apply       Manage the local-state bootstrap stack.' \
		'  make bootstrap-output                Show bootstrap outputs.' \
		'  make init STATE_BUCKET=<bucket>      Initialize the root remote-state backend.' \
		'  make plan|apply|destroy|output       Manage the root infrastructure stack.' \
		'  make deploy-frontend                 Build and publish the React app to Amplify.' \
		'  make push-backend                    Build/push x86 backend image to ECR.' \
		'  make validate|fmt                    Validate or format both stacks.' \
		'  make tofu ARGS="<command>"           Run an authenticated root OpenTofu command.' \
		'  make bootstrap-tofu ARGS="<command>" Run an authenticated bootstrap OpenTofu command.'

whoami:
	$(call with_env,$(AWS) sts get-caller-identity)

bootstrap-init:
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) init)

bootstrap-plan:
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) plan)

bootstrap-apply:
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) apply)

bootstrap-output:
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) output)

bootstrap-tofu:
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) $(ARGS))

init:
	$(call with_env,state_bucket="$(STATE_BUCKET)"; if [ -z "$$state_bucket" ]; then state_bucket="$$STATE_BUCKET"; fi; if [ -z "$$state_bucket" ]; then printf '%s\n' 'Set STATE_BUCKET in .env or pass STATE_BUCKET=<bucket>.' >&2; exit 1; fi; $(TOFU) -chdir=$(INFRA_DIR) init -backend-config="bucket=$$state_bucket" -backend-config="key=$(BACKEND_KEY)" -backend-config="region=$$AWS_REGION")

plan:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) plan)

apply:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) apply)

destroy:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) destroy)

output:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) output)

push-backend:
	@IMAGE_TAG="$(BACKEND_IMAGE_TAG)" TARGET_PLATFORM="$(TARGET_PLATFORM)" ./scripts/push-backend-ecr.sh

deploy-frontend:
	@./scripts/deploy-frontend.sh

validate:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) validate)
	$(call with_env,$(TOFU) -chdir=$(BOOTSTRAP_DIR) validate)

fmt:
	$(call with_env,$(TOFU) fmt -recursive $(INFRA_DIR))

tofu:
	$(call with_env,$(TOFU) -chdir=$(INFRA_DIR) $(ARGS))
