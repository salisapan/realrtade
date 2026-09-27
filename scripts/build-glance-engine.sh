#!/usr/bin/env bash
# Regenerates flow-landing/assets/glance-engine.js from the judgment engine
# in flow-trial-extension/src/. domains.js, extract.js, and judgment.js are
# the source of truth. flow-landing has no compile step, so this script is
# what keeps Inbox Scan (missed-deadline.html) on the same scorer as the
# Glance extension.
#
#   scripts/build-glance-engine.sh           write the landing copy
#   scripts/build-glance-engine.sh --check   exit 1 if that copy has drifted
#
# The "Last synced" date is ignored by --check. Regenerating on a later day
# without source changes stays green.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DIR="flow-trial-extension/src"
COMMITTED="flow-landing/assets/glance-engine.js"
SOURCES=(domains.js extract.js judgment.js)

usage() {
  echo "usage: scripts/build-glance-engine.sh [--check]" >&2
  exit 2
}

CHECK=0
if [[ $# -gt 1 ]]; then
  usage
elif [[ "${1:-}" == "--check" ]]; then
  CHECK=1
elif [[ $# -eq 1 ]]; then
  usage
fi

for src in "${SOURCES[@]}"; do
  if [[ ! -f "$SRC_DIR/$src" ]]; then
    echo "missing source: $SRC_DIR/$src" >&2
    exit 1
  fi
done

render() {
  local dest="$1"
  {
    echo "// Mirrored, not authored, here — source of truth is:"
    echo "//   flow-trial-extension/src/domains.js"
    echo "//   flow-trial-extension/src/extract.js"
    echo "//   flow-trial-extension/src/judgment.js"
    echo "// Regenerate with: scripts/build-glance-engine.sh"
    echo "// Last synced: $(date -u +%Y-%m-%d)"
    echo "//"
    echo "// This is the exact client-side judgment engine the Glance extension"
    echo "// runs — concatenated as-is (no edits) so Inbox Scan"
    echo "// (flow-landing/missed-deadline.html) runs the real product, not a"
    echo "// re-implementation of it."
    echo ""
    cat "$SRC_DIR/domains.js"
    echo ""
    cat "$SRC_DIR/extract.js"
    echo ""
    cat "$SRC_DIR/judgment.js"
  } > "$dest"
}

# Drop only the date stamp so the comparison is about the engine, not the day.
normalize() {
  sed 's|^// Last synced: .*|// Last synced: DATE|' "$1"
}

if [[ "$CHECK" -eq 1 ]]; then
  if [[ ! -f "$COMMITTED" ]]; then
    echo "missing $COMMITTED — run scripts/build-glance-engine.sh" >&2
    exit 1
  fi
  fresh=$(mktemp)
  norm_committed=$(mktemp)
  norm_fresh=$(mktemp)
  trap 'rm -f "$fresh" "$norm_committed" "$norm_fresh"' EXIT
  render "$fresh"
  normalize "$COMMITTED" > "$norm_committed"
  normalize "$fresh" > "$norm_fresh"
  if ! cmp -s "$norm_committed" "$norm_fresh"; then
    echo "glance-engine.js has drifted from flow-trial-extension/src/{domains,extract,judgment}.js" >&2
    echo "Regenerate it with: scripts/build-glance-engine.sh" >&2
    diff -u "$norm_committed" "$norm_fresh" | head -n 80 >&2 || true
    exit 1
  fi
  echo "glance-engine.js matches the extension scorer (date stamp ignored)."
  exit 0
fi

render "$COMMITTED"
echo "Wrote $COMMITTED"
