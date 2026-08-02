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
command -v curl >/dev/null || { echo "curl not found" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found" >&2; exit 1; }
command -v tofu >/dev/null || { echo "tofu not found" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip not found" >&2; exit 1; }

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

SITE_URL=$(tofu -chdir="$INFRA_DIR" output -raw site_url)
APP_ID=$(tofu -chdir="$INFRA_DIR" output -raw amplify_app_id)
BRANCH_NAME=$(tofu -chdir="$INFRA_DIR" output -raw amplify_branch_name)

TEMP_DIR=$(mktemp -d)
ARCHIVE="$TEMP_DIR/frontend.zip"
trap 'rm -rf "$TEMP_DIR"' EXIT

aws sts get-caller-identity >/dev/null

echo "Building frontend for $SITE_URL"
VITE_API_URL="$SITE_URL" pnpm --dir "$WEB_DIR" build

(cd "$WEB_DIR/dist" && zip -qr "$ARCHIVE" .)

read -r JOB_ID UPLOAD_URL < <(
  aws amplify create-deployment \
    --app-id "$APP_ID" \
    --branch-name "$BRANCH_NAME" \
    --region "$AWS_REGION" \
    --query '[jobId,zipUploadUrl]' \
    --output text
)

curl --fail --silent --show-error --upload-file "$ARCHIVE" "$UPLOAD_URL"

aws amplify start-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH_NAME" \
  --job-id "$JOB_ID" \
  --region "$AWS_REGION" >/dev/null

echo "Started Amplify deployment $JOB_ID for $SITE_URL"
