#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)/flow-trial-extension"
cd "$ROOT"
TZ_NAME="${1:-UTC}"
export TZ="$TZ_NAME"
echo "=== corpus-184-next TZ=$TZ_NAME ==="
run() {
  local name="$1" cmd="$2"
  local out err ec pass fail
  out=$(mktemp)
  set +e
  eval "$cmd" >"$out" 2>&1
  ec=$?
  set -e
  pass=$(rg -c '^PASS:' "$out" 2>/dev/null || echo 0)
  fail=$(rg -c '^FAIL:' "$out" 2>/dev/null || echo 0)
  drift=$(rg 'standing drift|TOTAL FAILURES' "$out" 2>/dev/null | tr '\n' ' ')
  tail1=$(tail -1 "$out" | tr -d '\n')
  echo "$name exit=$ec PASS=$pass FAIL=$fail $drift $tail1"
  if [[ "$name" == "gate-run4" && "$ec" != "0" ]]; then
    rg '^FAIL:' "$out" | head -12
  fi
  if [[ "$name" == "owa" ]]; then
    rg 'standing drift|TOTAL FAILURES' "$out" || true
  fi
  rm -f "$out"
}
run gate-run4 "node test/gate-run4-184-corpus.cjs"
run owa "node test/owa-page-harness.cjs"
run popup-open "node test/popup-open-corpus.cjs"
run request-types "node test/request-types-corpus.cjs"
run card-decision "node test/card-decision-corpus.cjs"
run mail-switch-race "node test/mail-switch-race-corpus.cjs"
run cc-only "node test/cc-only-recipients-corpus.cjs"
run glance-0956 "node test/glance-0956-corpus.cjs"
run outlook-calendar "node test/outlook-calendar-corpus.cjs"
run regress-144 "node test/regress-144-corpus.cjs"
run live-gap-165 "node test/live-gap-165-corpus.cjs"
