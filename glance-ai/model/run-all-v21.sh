#!/usr/bin/env bash
# v2.1 pipeline (v1 / v2 outputs untouched; writes only *-v21 / v21.* paths). ~8-9 min on the shared box.
# Heavy steps run one after another with 2 BLAS threads; refuses to start the trainer with <1.5 GB available.
set -euo pipefail
cd "$(dirname "$0")"
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2
free -m | head -2
mkdir -p dataset/out-v21 shadow/out-v21
node dataset/v21/build-dataset-v21.cjs > dataset/out-v21/build.log          # bare / subject-only shapes + v21 short-ask frames
node dataset/v21/adversarial-v21.cjs                                        # v2's 74 + 40 bare probes
node train/export-features-v21.cjs                                          # featurize-v21 (v2 + shape + delex features)
avail=$(free -m | awk '/^Mem:/{print $7}'); if [ "$avail" -lt 1500 ]; then echo "only ${avail} MB available; not starting the trainer"; exit 1; fi
.venv/bin/python -u train/train-v21.py --tag v21 --repo-weight 3 --strict-target 0.018 --gate-c 16 --chooser-c 32 2>&1 | grep --line-buffered -v Warning | tee train/train-v21.log | grep -E "OOF tau|budgets|chooser floor|^  test "
node runtime/parity-check-v21.cjs                                           # JS int8 vs python
node runtime/pack-weights-v21.cjs v21 0                                     # packed on-device weights (871 KB budget)
node shadow/run-shadow-v21.cjs > shadow/out-v21/run.log                     # v1 / v2 / v2.1 / engines, normalizer in front
node shadow/norm-flips-v21.cjs                                              # how many of the 767 format flips disappear
