#!/usr/bin/env bash
# Build and publish the analytics workflow Lambda code to its unqualified function ARN.
# Step Functions invokes this function without an alias, so updating $LATEST is sufficient.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
INFRA_DIR="$ROOT_DIR/infras"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found" >&2; exit 1; }
command -v tofu >/dev/null || { echo "tofu not found" >&2; exit 1; }

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [[ -z "$AWS_REGION" ]]; then
  AWS_REGION=$(aws configure get region 2>/dev/null || true)
fi
if [[ -z "$AWS_REGION" ]]; then
  echo "Set AWS_REGION in .env or your AWS environment." >&2
  exit 1
fi

FUNCTION="${FUNCTION:-$(tofu -chdir="$INFRA_DIR" output -raw analytics_workflow_function_name)}"
if [[ -z "$FUNCTION" || "$FUNCTION" == "null" ]]; then
  echo "analytics_workflow_function_name is empty; is enable_analytics_pipeline set?" >&2
  exit 1
fi

aws sts get-caller-identity >/dev/null

echo "Building analytics workflow Lambda bundle"
(cd "$BACKEND_DIR" && pnpm build:analytics-workflow)

ZIP="$BACKEND_DIR/dist-function/analytics-workflow.zip"
test -f "$ZIP" || { echo "Analytics Lambda bundle not found: $ZIP" >&2; exit 1; }

echo "Publishing $ZIP to $FUNCTION"
aws lambda update-function-code \
  --region "$AWS_REGION" \
  --function-name "$FUNCTION" \
  --zip-file "fileb://$ZIP" >/dev/null

# update-function-code returns before $LATEST's LastUpdateStatus is 'Successful'.
for _ in $(seq 1 90); do
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

echo "Published $FUNCTION analytics workflow code successfully"
