#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
OUTPUT=${1:-"$ROOT_DIR/submission.zip"}

if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [output-archive.zip]" >&2
  exit 2
fi

if [[ "$OUTPUT" != /* ]]; then
  OUTPUT="$PWD/$OUTPUT"
fi

OUTPUT_DIR=$(dirname -- "$OUTPUT")
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR=$(cd -- "$OUTPUT_DIR" && pwd)
OUTPUT="$OUTPUT_DIR/$(basename -- "$OUTPUT")"

command -v git >/dev/null || { echo "git not found" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip not found" >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip not found" >&2; exit 1; }

test -d "$ROOT_DIR/.git" || {
  echo "Repository metadata not found: $ROOT_DIR/.git" >&2
  exit 1
}

is_excluded_path() {
  local path=$1

  case "/$path" in
    */doc_images|*/doc_images/*|*/deploy|*/deploy/*|*/data|*/data/*)
      return 0
      ;;
    */.env|*/.env.*)
      [[ "$path" == *.env.example ]] && return 1
      return 0
      ;;
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      return 0
      ;;
    */.aws/*|*/.ssh/*|*/credentials|*/credentials.*)
      return 0
      ;;
    *.tfstate|*.tfstate.*|*.tfvars|*.tfplan)
      [[ "$path" == *.example ]] && return 1
      return 0
      ;;
    */.opencode|*/.opencode/*|*/.agents|*/.agents/*|*/.claude|*/.claude/*)
      return 0
      ;;
  esac

  return 1
}

TMP_DIR=$(mktemp -d)
STAGING_DIR="$TMP_DIR/submission"
CODE_DIR="$STAGING_DIR/code"
trap 'rm -rf -- "$TMP_DIR"' EXIT
mkdir -p -- "$CODE_DIR"

# Include tracked files and non-ignored worktree files so the archive represents
# the current repository, while still applying an explicit secret-file denylist.
while IFS= read -r -d '' relative_path; do
  if is_excluded_path "$relative_path"; then
    continue
  fi

  if [[ "$OUTPUT" == "$ROOT_DIR/"* && "$relative_path" == "${OUTPUT#"$ROOT_DIR/"}" ]]; then
    continue
  fi

  source_path="$ROOT_DIR/$relative_path"
  destination_path="$CODE_DIR/$relative_path"

  if [[ -L "$source_path" ]]; then
    link_target=$(readlink "$source_path")
    if [[ "$link_target" == /* ]]; then
      echo "Refusing absolute symbolic link: $relative_path" >&2
      exit 1
    fi

    resolved_parent=$(cd -P -- "$(dirname -- "$source_path")/$(dirname -- "$link_target")" && pwd)
    resolved_path="$resolved_parent/$(basename -- "$link_target")"
    if [[ "$resolved_path" != "$ROOT_DIR/"* || ! -e "$resolved_path" ]]; then
      echo "Refusing symbolic link outside the repository: $relative_path" >&2
      exit 1
    fi
  fi
  [[ -f "$source_path" || -L "$source_path" ]] || continue

  mkdir -p -- "$(dirname -- "$destination_path")"
  cp -pP -- "$source_path" "$destination_path"
done < <(git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard -z)

# Refuse common credential signatures even if a secret was committed under an
# innocuous file name. Do not print matching content.
if LC_ALL=C grep -RIlE \
  -e '-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'ASIA[0-9A-Z]{16}' \
  -e 'gh[pousr]_[A-Za-z0-9_]{20,}' \
  -e 'sk-[A-Za-z0-9_-]{20,}' \
  "$CODE_DIR" >/dev/null; then
  echo "Archive refused: potential credential content detected." >&2
  exit 1
fi

rm -f -- "$OUTPUT"
(
  cd -- "$STAGING_DIR"
  zip -qry "$OUTPUT" code
)

while IFS= read -r archive_path; do
  archive_path=${archive_path#code/}
  if is_excluded_path "$archive_path"; then
    rm -f -- "$OUTPUT"
    echo "Archive validation failed: excluded path present." >&2
    exit 1
  fi
done < <(unzip -Z1 "$OUTPUT")

echo "Created secret-safe source archive: $OUTPUT"
echo "Add this code/ directory to the final assessment ZIP with the required document, doc_images/, deploy/, and data/."
