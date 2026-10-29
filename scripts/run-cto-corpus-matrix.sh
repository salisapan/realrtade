#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
run_one() {
  local tz="$1" file="$2"
  local name
  name="$(basename "$file")"
  local dir
  if [[ "$file" == glance-gmail-addon/* ]]; then dir="$ROOT/glance-gmail-addon"; else dir="$ROOT/flow-trial-extension"; fi
  local rel="${file#*/test/}"
  local out
  if ! out="$(cd "$dir" && TZ="$tz" node "test/$rel" 2>&1)"; then
    local fails
    fails="$(echo "$out" | rg -o 'FAILURES?:\s*[0-9]+|failed' | tail -1 || echo "FAIL")"
    echo "$tz|$name|RED|$fails"
    echo "$out" | rg "^FAIL" | head -5
    return
  fi
  local pass fail
  pass="$(echo "$out" | rg -c '^PASS:' || true)"
  fail="$(echo "$out" | rg -o 'FAILURES?:\s*[0-9]+' | tail -1 | rg -o '[0-9]+' || echo 0)"
  if [[ "$fail" != "0" ]]; then
    echo "$tz|$name|RED|pass=$pass fail=$fail"
  else
    echo "$tz|$name|GREEN|pass=$pass fail=0"
  fi
}

CORPORA=(
  "glance-gmail-addon/test/v1.test.cjs"
  "glance-gmail-addon/test/build-stamp.test.cjs"
  "glance-gmail-addon/test/card-titles-corpus.cjs"
  "flow-trial-extension/test/lane-plan-parity-corpus.cjs"
  "flow-trial-extension/test/outlook-calendar-corpus.cjs"
  "flow-trial-extension/test/incoming-judge-remember-meeting-corpus.cjs"
  "flow-trial-extension/test/gmail-outlook-parity-corpus.cjs"
  "flow-trial-extension/test/deadline-meeting-corpus.cjs"
  "flow-trial-extension/test/intent-actions-corpus.cjs"
  "flow-trial-extension/test/scheduling-ask-corpus.cjs"
  "flow-trial-extension/test/hebrew-hold-corpus.cjs"
  "flow-trial-extension/test/close-families-corpus.cjs"
  "flow-trial-extension/test/google-closes-corpus.cjs"
  "flow-trial-extension/test/work-product-ask-corpus.cjs"
)

for tz in UTC Asia/Jerusalem; do
  echo "=== TZ=$tz ==="
  for f in "${CORPORA[@]}"; do
    run_one "$tz" "$f"
  done
done
