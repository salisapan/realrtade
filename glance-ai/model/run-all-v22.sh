#!/usr/bin/env bash
# v2.2 pipeline (no training; v1 / v2 / v2.1 outputs untouched; writes shadow-pkg/, suggest-save/out, strip/out, dataset/out-v22).
# ~5 min on the shared box, single-threaded Node + Python. Refuses to start with < 1.5 GB available.
set -euo pipefail
cd "$(dirname "$0")"
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2
avail=$(free -m | awk '/^Mem:/{print $7}'); echo "available ${avail} MB"
if [ "$avail" -lt 1500 ]; then echo "only ${avail} MB available; not starting (retry later)"; exit 1; fi
echo "== 1) shadow drop-in package (pack, parity JS==Python, logging tests, perf, size)"
./shadow-pkg/run-tests.sh
echo "== 2) suggest-save rule (22 spec rows, edge cases, JS==Python) + dataset target"
mkdir -p suggest-save/out
(cd suggest-save && node make-corpus.cjs && node test-corpus.cjs | tail -2 && python3 test_corpus.py | tail -2 \
  && node build-suggest-dataset.cjs > out/build.log && python3 check_dataset.py)
echo "== 3) footer/signature/disclaimer/[image] stripper (767 flips, gold invariance, JS==Python bytes)"
mkdir -p strip/out
(cd strip && node test-strip.cjs 2>/dev/null | tail -n +1 > out/strip-summary.json && cat out/strip-summary.json && python3 test_strip.py)
echo "== v2.2 done"
