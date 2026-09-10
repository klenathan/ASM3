#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
OUTPUT=${1:-"$ROOT_DIR/submission.zip"}
REPORT_PDF_NAME=CloudComputing_s3891890_report.pdf
REPORT_PDF="$ROOT_DIR/$REPORT_PDF_NAME"
FIGURES_DIR="$ROOT_DIR/docs/architecture/report/figures"


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
    */docs|*/docs/*|*/doc_images|*/doc_images/*|*/deploy|*/deploy/*)
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
DOC_IMAGES_DIR="$STAGING_DIR/doc_images"
trap 'rm -rf -- "$TMP_DIR"' EXIT
mkdir -p -- "$CODE_DIR" "$DOC_IMAGES_DIR" "$STAGING_DIR/data"

[[ -d "$ROOT_DIR/data/migrations" ]] || {
  echo "Missing required migration data directory: data/migrations" >&2
  exit 1
}

[[ -f "$REPORT_PDF" ]] || {
  echo "Report PDF not found: $REPORT_PDF" >&2
  exit 1
}
[[ -d "$FIGURES_DIR" ]] || {
  echo "Report figures directory not found: $FIGURES_DIR" >&2
  exit 1
}
cp -p -- "$REPORT_PDF" "$STAGING_DIR/$REPORT_PDF_NAME"

# Include only publishable figure images, preserving any figure subdirectories.
image_count=0
while IFS= read -r -d '' figure_path; do
  relative_figure_path=${figure_path#"$FIGURES_DIR/"}
  destination_path="$DOC_IMAGES_DIR/$relative_figure_path"
  mkdir -p -- "$(dirname -- "$destination_path")"
  cp -p -- "$figure_path" "$destination_path"
  image_count=$((image_count + 1))
done < <(
  find "$FIGURES_DIR" -type f \( \
    -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' \
    -o -iname '*.svg' -o -iname '*.webp' -o -iname '*.tif' -o -iname '*.tiff' \
  \) -print0
)

(( image_count > 0 )) || {
  echo "No report figure images found: $FIGURES_DIR" >&2
  exit 1
}


# Include tracked files and non-ignored worktree files so the archive represents
# the current repository, while still applying an explicit secret-file denylist.
while IFS= read -r -d '' relative_path; do
  if is_excluded_path "$relative_path"; then
    continue
  fi

  [[ "$relative_path" == "$REPORT_PDF_NAME" ]] && continue

  if [[ "$OUTPUT" == "$ROOT_DIR/"* && "$relative_path" == "${OUTPUT#"$ROOT_DIR/"}" ]]; then
    continue
  fi

  source_path="$ROOT_DIR/$relative_path"
  if [[ "$relative_path" == data/* ]]; then
    destination_path="$STAGING_DIR/$relative_path"
  else
    destination_path="$CODE_DIR/$relative_path"
  fi

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
  zip -qry "$OUTPUT" code data doc_images "$REPORT_PDF_NAME"
)

while IFS= read -r archive_path; do
  if [[ "$archive_path" == code/* ]]; then
    if is_excluded_path "${archive_path#code/}"; then
      rm -f -- "$OUTPUT"
      echo "Archive validation failed: excluded code path present." >&2
      exit 1
    fi
  fi
done < <(unzip -Z1 "$OUTPUT")

unzip -Z1 "$OUTPUT" | grep -Fx -- "$REPORT_PDF_NAME" >/dev/null || {
  rm -f -- "$OUTPUT"
  echo "Archive validation failed: report PDF missing." >&2
  exit 1
}

while IFS= read -r -d '' migration_path; do
  relative_migration_path=${migration_path#"$ROOT_DIR/data/"}
  unzip -Z1 "$OUTPUT" | grep -Fx -- "data/$relative_migration_path" >/dev/null || {
    rm -f -- "$OUTPUT"
    echo "Archive validation failed: migration missing." >&2
    exit 1
  }
done < <(find "$ROOT_DIR/data/migrations" -type f -name '*.sql' -print0)

while IFS= read -r -d '' figure_path; do
  relative_figure_path=${figure_path#"$DOC_IMAGES_DIR/"}
  unzip -Z1 "$OUTPUT" | grep -Fx -- "doc_images/$relative_figure_path" >/dev/null || {
    rm -f -- "$OUTPUT"
    echo "Archive validation failed: report figure missing." >&2
    exit 1
  }
done < <(find "$DOC_IMAGES_DIR" -type f -print0)

echo "Created submission archive: $OUTPUT"
echo "Contains code/ (without docs/), data/ migrations, doc_images/ report figures, and $REPORT_PDF_NAME."
