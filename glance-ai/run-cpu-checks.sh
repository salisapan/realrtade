#!/usr/bin/env bash
# CPU checks that run on a fresh Linux machine. No LLM download, no GPU, no training.
# From the repository root:  bash glance-ai/run-cpu-checks.sh
#
# Two checks need historical extension trees. They are materialized with git archive
# into temp directories and never committed:
#   8f8edaee0137a5c0bf50e61e5f1bdcab33029f18  Glance 0.9.34, test corpora for dataset/out-v2/all.jsonl
#   db563fd984e848d1edfaf40f3cda1d2261784a81  Glance 0.9.35, the reference engine for labels and the 767-flip gate
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"
mkdir -p model/suggest-save/out model/strip/out

ENG35="$(mktemp -d)"
HARVEST="$(mktemp -d)"
cleanup() { rm -rf "$ENG35" "$HARVEST"; }
trap cleanup EXIT

echo "== Hebrew currency veto"
node oss/veto/test-hebrew-amount.cjs
echo "== suggest-save corpus (JS, then Python parity)"
node model/suggest-save/test-corpus.cjs
python3 model/suggest-save/test_corpus.py
echo "== suggest-save dataset equality (no new chips)"
python3 model/suggest-save/check_dataset.py

echo "== materialize 0.9.34 harvest tree and 0.9.35 engine"
git -C "$REPO" archive 8f8edaee0137a5c0bf50e61e5f1bdcab33029f18 flow-trial-extension | tar -x -C "$HARVEST" --strip-components=1
git -C "$REPO" archive db563fd984e848d1edfaf40f3cda1d2261784a81 flow-trial-extension | tar -x -C "$ENG35" --strip-components=1
export GLANCE_TIP="$HARVEST"
export GLANCE_V2_ENGINE=0.9.35
export GLANCE_NOW="${GLANCE_NOW:-2026-10-07T12:00:00+03:00}"
GLANCE_ENGINE_ROOTS="$(printf '{"0.9.35":"%s"}' "$ENG35")"
export GLANCE_ENGINE_ROOTS

echo "== regenerate dataset/out-v2/all.jsonl and check sha256"
node model/dataset/build-dataset.cjs >/dev/null
node model/dataset/v2/build-dataset-v2.cjs >/dev/null
EXPECT="$(tr -d '[:space:]' < model/dataset/v2/all.jsonl.sha256)"
GOT="$(sha256sum model/dataset/out-v2/all.jsonl | awk '{print $1}')"
echo "all.jsonl sha256 $GOT"
if [ "$GOT" != "$EXPECT" ]; then
  echo "all.jsonl sha256 mismatch: got $GOT expected $EXPECT" >&2
  exit 1
fi
echo "all.jsonl sha256 matches model/dataset/v2/all.jsonl.sha256"

echo "== stripper stress hashes and 767-flip gate"
node model/strip/test-strip.cjs
python3 model/strip/test_strip.py
echo "== norm-flip check (0.9.35 gate, tip measured alongside)"
node model/shadow/norm-flips-v21.cjs
echo "== shadow package (logging, feature parity, JS dense parity, Python decision parity, size)"
bash model/shadow-pkg/run-tests.sh
echo "== gated OSS score from cached predictions"
node oss/shadow-combined/gated/score-gated.cjs qwen3.5-4b
echo "== cpu checks done"
