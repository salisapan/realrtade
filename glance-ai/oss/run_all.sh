#!/bin/bash
# Sequential driver: for each model: serve -> full schema-constrained run -> unconstrained subset run (JSON validity)
cd "$(dirname "$0")"
run(){ gguf=$1; tag=$2; thr=${3:-4}
  ./serve.sh $gguf $tag $thr || return
  PID=$(pgrep -f "llama-server .*--port 8091")
  (cd eval && python3 run_llm.py --tag $tag --pid $PID > ../results/run-$tag.log 2>&1)
  (cd eval && python3 run_llm.py --tag $tag --mode free --ids $(cat eval/free_subset.txt 2>/dev/null || cat free_subset.txt) --pid $PID > ../results/run-$tag-free.log 2>&1)
  echo "$tag done $(date)"
}
for spec in "$@"; do run $spec; done
pkill -f "llama-server .*--port 8091"; echo ALL DONE
