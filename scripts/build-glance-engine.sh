#!/usr/bin/env bash
# Regenerates flow-landing/assets/glance-engine.js from the real judgment
# engine's source of truth in flow-trial-extension/src/. Run this any time
# domains.js, extract.js, or judgment.js change — there is no build step for
# flow-landing, so this is the one manual step that keeps the marketing
# site's copy of the engine in sync with the extension's.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DIR="flow-trial-extension/src"
OUT="flow-landing/assets/glance-engine.js"

{
  echo "// Mirrored, not authored, here — source of truth is:"
  echo "//   flow-trial-extension/src/domains.js"
  echo "//   flow-trial-extension/src/extract.js"
  echo "//   flow-trial-extension/src/judgment.js"
  echo "// Regenerate with: scripts/build-glance-engine.sh"
  echo "// Last synced: $(date -u +%Y-%m-%d)"
  echo "//"
  echo "// This is the exact client-side judgment engine the Glance extension"
  echo "// runs — concatenated as-is (no edits) so the live demo on trial.html"
  echo "// runs the real product, not a re-implementation of it."
  echo ""
  cat "$SRC_DIR/domains.js"
  echo ""
  cat "$SRC_DIR/extract.js"
  echo ""
  cat "$SRC_DIR/judgment.js"
} > "$OUT"

echo "Wrote $OUT"
