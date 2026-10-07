#!/bin/bash
# usage: serve.sh <model.gguf> <tag> [threads]
cd "$(dirname "$0")"
pkill -f "llama-server .*--port 8091"
for i in $(seq 1 60); do pgrep -f "llama-server .*--port 8091" >/dev/null || break; sleep 1; done
pkill -9 -f "llama-server .*--port 8091"; sleep 1
nohup bin/llama-b11429/llama-server -m models/$1 -c ${CTX:-2048} -t ${3:-4} -tb ${3:-4} -np 1 --port 8091 --jinja > results/server-$2.$(date +%s).log 2>&1 &
for i in $(seq 1 180); do curl -s localhost:8091/v1/models | grep -q "$1" && { echo "up after $i s ($1)"; exit 0; }; sleep 1; done; echo FAIL; exit 1
