#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
INFRA_DIR="$ROOT_DIR/infras"
BACKEND_DIR="$ROOT_DIR/backend"

# Reuse local AWS_PROFILE/AWS_REGION credentials when invoked directly.
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker not found" >&2; exit 1; }
command -v tofu >/dev/null || { echo "tofu not found" >&2; exit 1; }

test -f "$BACKEND_DIR/Dockerfile" || {
  echo "Backend Dockerfile not found: $BACKEND_DIR/Dockerfile" >&2
  exit 1
}

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [[ -z "$AWS_REGION" ]]; then
  AWS_REGION=$(aws configure get region 2>/dev/null || true)
fi
if [[ -z "$AWS_REGION" ]]; then
  echo "Set AWS_REGION in .env or your AWS environment." >&2
  exit 1
fi

TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
BUILD_TARGET="${BUILD_TARGET:-runtime}"

case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *)
    echo "TARGET_PLATFORM must be linux/amd64 or linux/arm64; got: $TARGET_PLATFORM" >&2
    exit 1
    ;;
esac

case "$BUILD_TARGET" in
  runtime|database-bootstrap) ;;
  *)
    echo "BUILD_TARGET must be runtime or database-bootstrap; got: $BUILD_TARGET" >&2
    exit 1
    ;;
esac

# The runtime image is always published under the 'latest' tag referenced by the
# ECS task definition, then the service is force-deployed below. The
# database-bootstrap target keeps its caller-provided tag so it matches the
# one-shot task definition instead of the service.
if [[ "$BUILD_TARGET" == "runtime" ]]; then
  IMAGE_TAG="latest"
elif [[ -z "${IMAGE_TAG:-}" ]]; then
  echo "IMAGE_TAG is required when BUILD_TARGET=database-bootstrap." >&2
  exit 1
fi

REPOSITORY_URL="${ECR_REPOSITORY_URL:-$(tofu -chdir="$INFRA_DIR" output -raw backend_ecr_repository_url)}"
REGISTRY="${REPOSITORY_URL%%/*}"
IMAGE_URI="$REPOSITORY_URL:$IMAGE_TAG"

aws sts get-caller-identity >/dev/null
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

echo "Building $IMAGE_URI ($BUILD_TARGET) for $TARGET_PLATFORM"
docker buildx build \
  --platform "$TARGET_PLATFORM" \
  --provenance=false \
  --target "$BUILD_TARGET" \
  --tag "$IMAGE_URI" \
  --push \
  "$BACKEND_DIR"

echo "Pushed $IMAGE_URI"

if [[ "$BUILD_TARGET" == "runtime" ]]; then
  CLUSTER=$(tofu -chdir="$INFRA_DIR" output -raw ecs_cluster_name)
  SERVICE=$(tofu -chdir="$INFRA_DIR" output -raw ecs_service_name)
  DESIRED_COUNT=$(aws ecs describe-services \
    --region "$AWS_REGION" \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --query 'services[0].desiredCount' \
    --output text)

  if [[ "$DESIRED_COUNT" == "0" ]]; then
    echo "Skipped ECS deployment for service $SERVICE because its desired count is 0"
  else
    aws ecs update-service \
      --region "$AWS_REGION" \
      --cluster "$CLUSTER" \
      --service "$SERVICE" \
      --force-new-deployment >/dev/null
    echo "Forced a new task deployment for ECS service $SERVICE"
  fi
fi
