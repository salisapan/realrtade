#!/bin/bash
# Bigger models: core subset (all of Sets B/C/D + every 3rd Set A case) to fit the shared-CPU budget.
cd "$(dirname "$0")"
for spec in "$@"; do set -- $spec; gguf=$1; tag=$2; thr=${3:-3}
  ./serve.sh $gguf $tag $thr || continue
  PID=$(pgrep -f "llama-server .*--port 8091")
  (cd eval && python3 run_llm.py --tag $tag --ids $(cat core_subset.txt) --pid $PID > ../results/run-$tag.log 2>&1)
  echo "$tag done $(date)"
done
pkill -f "llama-server .*--port 8091"; echo ALL DONE
