#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
INFRA_DIR="$ROOT_DIR/infras"
WEB_DIR="$ROOT_DIR/web"

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

test -f "$WEB_DIR/package.json" || {
  echo "Frontend package manifest not found: $WEB_DIR/package.json" >&2
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

API_URL=$(tofu -chdir="$INFRA_DIR" output -raw api_url)
REPOSITORY_URL="${ECR_REPOSITORY_URL:-$(tofu -chdir="$INFRA_DIR" output -raw web_ecr_repository_url)}"
REGISTRY="${REPOSITORY_URL%%/*}"
IMAGE_TAG="${1:-${IMAGE_TAG:-latest}}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
IMAGE_URI="$REPOSITORY_URL:$IMAGE_TAG"

case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *)
    echo "TARGET_PLATFORM must be linux/amd64 or linux/arm64; got: $TARGET_PLATFORM" >&2
    exit 1
    ;;
esac

aws sts get-caller-identity >/dev/null

echo "Building $IMAGE_URI for $API_URL"
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

docker buildx build \
  --platform "$TARGET_PLATFORM" \
  --provenance=false \
  --build-arg "VITE_API_URL=$API_URL" \
  --tag "$IMAGE_URI" \
  --push \
  "$WEB_DIR"

echo "Pushed frontend image $IMAGE_URI"
