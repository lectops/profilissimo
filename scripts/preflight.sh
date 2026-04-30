#!/usr/bin/env bash
# Pre-release sanity check.
#
# Verifies that all four version-bearing files agree on the same version
# string before you tag a release. CWS rejects re-uploads of the same
# version, so a single mismatched file means a wasted CWS submission.
#
# Usage:
#   scripts/preflight.sh            # report current versions
#   scripts/preflight.sh 1.0.1      # require all files to be exactly 1.0.1

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_version() {
  local file="$1"
  # Match the first top-level "version": "..." entry. Avoids pulling in
  # versions from nested objects (devDependencies, etc.).
  awk -F'"' '/^[[:space:]]*"version"[[:space:]]*:/ { print $4; exit }' "$file"
}

# Parallel arrays: FILES[i] has version VERSIONS[i].
# (Indexed arrays only — macOS bash 3.x does not support associative arrays.)
FILES=(
  "package.json"
  "extension/package.json"
  "extension/public/manifest.json"
  "native-host/package.json"
)
VERSIONS=()
fail=0

for f in "${FILES[@]}"; do
  path="$ROOT/$f"
  if [[ ! -f "$path" ]]; then
    echo "MISSING: $f" >&2
    fail=1
    VERSIONS+=("")
    continue
  fi
  v="$(read_version "$path")"
  if [[ -z "$v" ]]; then
    echo "NO VERSION FIELD: $f" >&2
    fail=1
  fi
  VERSIONS+=("$v")
done

if (( fail )); then
  exit 1
fi

printf '%-32s  %s\n' "FILE" "VERSION"
printf '%-32s  %s\n' "----" "-------"
for i in "${!FILES[@]}"; do
  printf '%-32s  %s\n' "${FILES[$i]}" "${VERSIONS[$i]}"
done
echo

first="${VERSIONS[0]}"
mismatch=0
for v in "${VERSIONS[@]}"; do
  if [[ "$v" != "$first" ]]; then
    mismatch=1
  fi
done

if (( mismatch )); then
  echo "FAIL: versions disagree across files." >&2
  exit 1
fi

echo "OK: all files agree on version $first."

if [[ $# -ge 1 ]]; then
  target="$1"
  if [[ "$first" != "$target" ]]; then
    echo "FAIL: expected version $target, found $first." >&2
    echo "Edit the four files above to $target and re-run." >&2
    exit 1
  fi
  echo "OK: matches requested release version $target."
fi
