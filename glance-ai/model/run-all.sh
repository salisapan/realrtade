#!/usr/bin/env bash
# Rebuild everything end to end (offline, box only). ~4-6 min on 8 CPUs.
set -euo pipefail
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q numpy scipy scikit-learn skl2onnx onnx onnxruntime; }
node dataset/build-dataset.cjs > /dev/null && echo "dataset: $(node -e "const s=require('./dataset/out/summary.json');console.log(s.total+' rows ('+s.synthetic+' synthetic, '+s.repoFixtures+' repo fixtures, '+s.repoTestStrings+' repo test strings, owner-verified '+s.ownerVerified+')')")"
node dataset/adversarial.cjs | tail -1
node train/export-features.cjs > /dev/null
.venv/bin/python train/train.py v1 v1c 2>&1 | grep -v -i warn
.venv/bin/python train/parity_onnx.py v1 > /dev/null && node runtime/parity-check.cjs v1
node shadow/run-shadow.cjs v1 v1c > /dev/null && echo "report: shadow/out/report.md"
