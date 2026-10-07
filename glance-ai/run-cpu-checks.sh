#!/usr/bin/env bash
# CPU checks that run on a fresh Linux machine. No LLM download, no GPU, no training.
# From the repository root:  bash glance-ai/run-cpu-checks.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p model/suggest-save/out model/strip/out
echo "== Hebrew currency veto"
node oss/veto/test-hebrew-amount.cjs
echo "== suggest-save corpus (JS, then Python parity)"
node model/suggest-save/test-corpus.cjs
python3 model/suggest-save/test_corpus.py
echo "== suggest-save dataset equality (no new chips)"
python3 model/suggest-save/check_dataset.py
echo "== stripper stress hashes (full 767-flip gate skips without the regenerated dataset)"
node model/strip/test-strip.cjs
python3 model/strip/test_strip.py
echo "== shadow package (logging, feature parity, JS dense parity, size)"
bash model/shadow-pkg/run-tests.sh
echo "== gated OSS score from cached predictions"
node oss/shadow-combined/gated/score-gated.cjs qwen3.5-4b
echo "== cpu checks done"
