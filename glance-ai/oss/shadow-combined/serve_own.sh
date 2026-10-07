#!/bin/bash
# usage: serve_own.sh <model.gguf> <tag> [threads]  -- own port 8093; kills only the llama-server on 8093 (ours)
cd "$(dirname "$0")/.."
P=8093
pkill -f "llama-server .*--port $P" ; sleep 2; pkill -9 -f "llama-server .*--port $P"; sleep 1
nohup bin/llama-b11429/llama-server -m models/$1 -c ${CTX:-2048} -t ${3:-3} -tb ${3:-3} -np 1 --port $P --jinja > shadow-combined/server-$2.log 2>&1 &
for i in $(seq 1 240); do curl -s localhost:$P/v1/models | grep -q "$1" && { echo "up after $i s ($1) pid $(pgrep -f "llama-server .*--port $P")"; exit 0; }; sleep 1; done; echo FAIL; exit 1
