#!/usr/bin/env bash
# Build and publish the content-analysis Lambda, then update the prod alias.
# Mirrors push-backend-ecr.sh conventions (sources .env, reads Tofu outputs).
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
INFRA_DIR="$ROOT_DIR/infras"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v tofu >/dev/null || { echo "tofu not found" >&2; exit 1; }

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
[[ -z "$AWS_REGION" ]] && AWS_REGION=$(aws configure get region 2>/dev/null || true)
[[ -z "$AWS_REGION" ]] && { echo "Set AWS_REGION in .env or your AWS environment." >&2; exit 1; }

FUNCTION="${FUNCTION:-$(tofu -chdir="$INFRA_DIR" output -raw content_analysis_function_name)}"
ALIAS="${ALIAS:-prod}"

if [[ -z "$FUNCTION" || "$FUNCTION" == "null" ]]; then
  echo "content_analysis_function_name is empty; is enable_content_analysis_lambda set?" >&2
  exit 1
fi

aws sts get-caller-identity >/dev/null

echo "Building Lambda bundle"
(cd "$BACKEND_DIR" && pnpm build:content-analysis)

ZIP="$BACKEND_DIR/dist-function/content-analysis.zip"
echo "Publishing $ZIP to $FUNCTION:$ALIAS"
aws lambda update-function-code \
  --region "$AWS_REGION" \
  --function-name "$FUNCTION" \
  --zip-file "fileb://$ZIP" >/dev/null

# update-function-code returns before $LATEST's LastUpdateStatus is 'Successful';
# publish-version raced against the still-running update raises
# ResourceConflictException ("An update is in progress for resource").
# Poll until the update settles before trying to publish a version.
for _ in $(seq 1 60); do
  STATUS=$(aws lambda get-function \
    --region "$AWS_REGION" \
    --function-name "$FUNCTION" \
    --qualifier '$LATEST' \
    --query 'Configuration.LastUpdateStatus' --output text 2>/dev/null || true)
  if [[ "$STATUS" == "Successful" ]]; then
    break
  fi
  if [[ "$STATUS" == "Failed" ]]; then
    echo "Lambda code update failed (LastUpdateStatus=Failed)." >&2
    exit 1
  fi
  sleep 2
done
if [[ "$STATUS" != "Successful" ]]; then
  echo "Timed out waiting for Lambda code update to finish (LastUpdateStatus=$STATUS)." >&2
  exit 1
fi

VERSION=$(aws lambda publish-version \
  --region "$AWS_REGION" \
  --function-name "$FUNCTION" \
  --query 'Version' --output text)

aws lambda update-alias \
  --region "$AWS_REGION" \
  --function-name "$FUNCTION" \
  --name "$ALIAS" \
  --function-version "$VERSION" >/dev/null

echo "Published $FUNCTION version $VERSION -> $ALIAS"
