#!/usr/bin/env bash
# Rebuild the lab's GENERATED, gitignored inputs in a fresh container (plan 2, Phase D on CPU). Idempotent: a step whose output exists is skipped.
# usage (from the repository root): bash glance-ai/teacher/bootstrap.sh [--check-dataset]   (--check-dataset stops after the dataset sha check)
# Produces: /tmp/harvest and /tmp/eng35 (historical extension trees by git archive, as run-cpu-checks.sh does), model/dataset/out-v2/ (sha-checked), model/.venv,
# model/train/features-v2, -v23, -v26, -v28, -v29, -frozen, and the pickled lab models v2 and v29 with their frozen-set predictions. About 30 minutes on CPU, no network
# except pip. It never touches the teacher key.
set -eu
REPO="$(git rev-parse --show-toplevel)"; cd "$REPO/glance-ai"
HARVEST=/tmp/harvest; ENG35=/tmp/eng35
[ -d "$HARVEST/core" ] || { mkdir -p "$HARVEST"; git -C "$REPO" archive 8f8edaee0137a5c0bf50e61e5f1bdcab33029f18 flow-trial-extension | tar -x -C "$HARVEST" --strip-components=1; }
[ -d "$ENG35/core" ] || { mkdir -p "$ENG35"; git -C "$REPO" archive db563fd984e848d1edfaf40f3cda1d2261784a81 flow-trial-extension | tar -x -C "$ENG35" --strip-components=1; }
export GLANCE_TIP="$HARVEST" GLANCE_V2_ENGINE=0.9.35 GLANCE_NOW=2026-10-07T12:00:00+03:00 GLANCE_ENGINE_ROOTS="{\"0.9.35\":\"$ENG35\"}"
if [ ! -f model/dataset/out-v2/all.jsonl ]; then node model/dataset/build-dataset.cjs >/dev/null; node model/dataset/v2/build-dataset-v2.cjs >/dev/null; fi
EXPECT="$(tr -d '[:space:]' < model/dataset/v2/all.jsonl.sha256)"; GOT="$(sha256sum model/dataset/out-v2/all.jsonl | awk '{print $1}')"
[ "$EXPECT" = "$GOT" ] && echo "dataset sha256 matches the pin ($GOT)" || { echo "dataset sha256 MISMATCH: got $GOT expected $EXPECT" >&2; exit 1; }
[ "${1:-}" = "--check-dataset" ] && exit 0
cd model
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; .venv/bin/pip install -q numpy scipy scikit-learn; fi
[ -f train/features-v2/train.jsonl ] || node train/export-features-v2.cjs >/dev/null
[ -f train/features-v23/train.jsonl ] || node train/gap-labels-v23.cjs >/dev/null
[ -f train/features-v26/train.jsonl ] || GLANCE_V25=c node train/gap-labels-v25.cjs >/dev/null
[ -f train/features-v28/train.jsonl ] || node train/gap-labels-v28.cjs >/dev/null
[ -f train/features-v29/train.jsonl ] || node train/gap-labels-v29.cjs >/dev/null
node train/export-frozen.cjs
cp train/features-v2/meta.json train/features-frozen/meta.json 2>/dev/null || true
for T in "v2 features-v2" "v29 features-v29"; do set -- $T
  [ -f "v2x/fz-$1/$1.model.pkl" ] || .venv/bin/python train/train-v2.py --feat "$2" --tag "$1" --out "v2x/fz-$1" --predict-set features-frozen/frozen.jsonl --no-export
done
echo "bootstrap done"
