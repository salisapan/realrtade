#!/bin/bash
# Sequential, one model at a time, memory-checked. Waits for the in-flight 2B run first.
cd "$(dirname "$0")"
while pgrep -f "run_llm.py --tag qwen3.5-2b" >/dev/null; do sleep 5; done
PID=$(pgrep -f "llama-server .*--port 8091")
(cd eval && python3 run_llm.py --tag qwen3.5-2b --mode free --ids $(cat free_subset.txt) --pid $PID > ../results/run-qwen3.5-2b-free.log 2>&1)
echo "qwen3.5-2b free done $(date)"
for spec in "DictaLM-3.0-1.7B-Instruct-Q4_K_M.gguf dictalm3-1.7b 1300" "Qwen3.5-4B-Q4_K_M.gguf qwen3.5-4b 3000" "gemma-4-E2B-it-Q4_K_M.gguf gemma4-e2b 3400"; do
  set -- $spec; gguf=$1; tag=$2; need=$3
  pkill -f "llama-server .*--port 8091"; sleep 4
  avail=$(free -m | awk '/Mem:/{print $7}')
  echo "$tag: available ${avail}MB, need ~${need}MB ($(date))"
  if [ "$avail" -lt "$need" ]; then echo "$tag SKIPPED: does not fit"; continue; fi
  CTX=2048 ./serve.sh $gguf $tag 3 || { echo "$tag server FAIL"; continue; }
  PID=$(pgrep -f "llama-server .*--port 8091")
  (cd eval && python3 run_llm.py --tag $tag --ids $(cat core_subset.txt) --pid $PID > ../results/run-$tag.log 2>&1)
  (cd eval && python3 run_llm.py --tag $tag --mode free --ids $(cat free_subset.txt) --pid $PID > ../results/run-$tag-free.log 2>&1)
  echo "$tag done $(date) avail_after=$(free -m | awk '/Mem:/{print $7}')MB"
done
pkill -f "llama-server .*--port 8091"; echo ALL DONE
