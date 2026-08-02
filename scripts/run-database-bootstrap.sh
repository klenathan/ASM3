#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
INFRA_DIR="$ROOT_DIR/infras"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v tofu >/dev/null || { echo "tofu not found" >&2; exit 1; }

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [[ -z "$AWS_REGION" ]]; then
  AWS_REGION=$(aws configure get region 2>/dev/null || true)
fi
if [[ -z "$AWS_REGION" ]]; then
  echo "Set AWS_REGION in .env or your AWS environment." >&2
  exit 1
fi

IMAGE_URI=$(tofu -chdir="$INFRA_DIR" output -raw database_bootstrap_image_uri)
IMAGE_TAG="${IMAGE_URI##*:}"
CLUSTER=$(tofu -chdir="$INFRA_DIR" output -raw ecs_cluster_name)
TASK_DEFINITION=$(tofu -chdir="$INFRA_DIR" output -raw database_bootstrap_task_definition_arn)
LOG_GROUP=$(tofu -chdir="$INFRA_DIR" output -raw database_bootstrap_log_group_name)

# Build exactly the tag referenced by the current OpenTofu task definition.
BUILD_TARGET=database-bootstrap IMAGE_TAG="$IMAGE_TAG" "$SCRIPT_DIR/push-backend-ecr.sh"

TASK_ARN=$(aws ecs run-task \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type EC2 \
  --count 1 \
  --started-by "rmit-society-database-bootstrap" \
  --query 'tasks[0].taskArn' \
  --output text)

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "ECS did not start the database bootstrap task." >&2
  exit 1
fi

echo "Waiting for database bootstrap task: $TASK_ARN"
aws ecs wait tasks-stopped --region "$AWS_REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN"

EXIT_CODE=$(aws ecs describe-tasks \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --query "tasks[0].containers[?name=='database-bootstrap'].exitCode | [0]" \
  --output text)

if [[ "$EXIT_CODE" != "0" ]]; then
  echo "Database bootstrap failed with exit code ${EXIT_CODE:-unknown}. Logs: $LOG_GROUP" >&2
  exit 1
fi

echo "Database migrations and initial seed data completed successfully. Logs: $LOG_GROUP"
