#!/usr/bin/env bash
# v2 pipeline (v1 outputs untouched). Heavy steps run sequentially with 2 BLAS threads (box is shared with the OSS worker).
set -euo pipefail
cd "$(dirname "$0")"
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
free -m | head -2
node dataset/v2/build-dataset-v2.cjs > dataset/out-v2/build.log
node dataset/v2/adversarial-v2.cjs
node train/export-features-v2.cjs
.venv/bin/python train/train-v2.py 2>&1 | grep -v Warning
node runtime/parity-check-v2.cjs
node shadow/run-shadow-v2.cjs > shadow/out-v2/run.log
node ../labeling/make-batch-001.cjs
