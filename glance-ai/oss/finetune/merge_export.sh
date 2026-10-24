#!/bin/bash
# Merge a LoRA adapter into its base, export to GGUF, quantize to Q4_K_M (and keep Q8_0 for parity checks).
#   ./merge_export.sh <base HF id> <adapter dir> <out name>     e.g. ./merge_export.sh Qwen/Qwen3.5-4B runs/qwen3.5-4b/adapter glance-judge-4b
# Needs: the oss-models venv (torch, transformers, peft) + llama.cpp's convert_hf_to_gguf.py and gguf-py (fetched once into tools/),
# and bin/llama-b11429/llama-quantize (same llama.cpp build as the eval server).
set -euo pipefail
cd "$(dirname "$0")"
BASE=$1; ADAPTER=$2; NAME=$3; PY=../.venv/bin/python; LLAMA=../bin/llama-b11429
mkdir -p merged gguf tools
# 1) merge (CPU is fine; ~2x model size in RAM in fp32 -- use bf16 on the GPU box)
$PY - "$BASE" "$ADAPTER" "merged/$NAME" <<'PY'
import sys, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
base, adapter, out = sys.argv[1:4]
dt = torch.bfloat16
m = AutoModelForCausalLM.from_pretrained(base, dtype=dt)
m = PeftModel.from_pretrained(m, adapter).merge_and_unload()
m.save_pretrained(out, safe_serialization=True); AutoTokenizer.from_pretrained(adapter).save_pretrained(out)
print('merged ->', out)
PY
# 2) convert (llama.cpp convert script pinned to the same release as the runtime; Qwen3.5 text arch is supported in b11429)
if [ ! -f tools/llama.cpp/convert_hf_to_gguf.py ]; then
  # source tarball of the same tag as the runtime binaries (no git needed)
  TAG="${LLAMA_TAG:-b11429}"; mkdir -p tools/llama.cpp
  curl -fsSL "https://github.com/ggml-org/llama.cpp/archive/refs/tags/$TAG.tar.gz" | tar -xz -C tools/llama.cpp --strip-components=1
fi
$PY -c 'import gguf' 2>/dev/null || uv pip install --python $PY -q -e tools/llama.cpp/gguf-py 'sentencepiece' 'protobuf'
# --no-mtp: Qwen3.5 configs declare an MTP (next-token-prediction) block, but AutoModelForCausalLM does not load/save its
# weights, so without this flag the GGUF gets block_count=N+1 and llama.cpp fails: "tensor 'blk.N.attn_norm.weight' not found".
# (The official Qwen3.5 GGUFs also ship without MTP.)
$PY tools/llama.cpp/convert_hf_to_gguf.py "merged/$NAME" --no-mtp --outtype bf16 --outfile "gguf/$NAME-bf16.gguf"
# 3) quantize
$LLAMA/llama-quantize "gguf/$NAME-bf16.gguf" "gguf/$NAME-Q8_0.gguf" Q8_0
$LLAMA/llama-quantize "gguf/$NAME-bf16.gguf" "gguf/$NAME-Q4_K_M.gguf" Q4_K_M
ls -la gguf/
echo "serve: ../shadow-combined/serve_own.sh ../finetune/gguf/$NAME-Q4_K_M.gguf $NAME 3   (model path relative to oss-models/models)"
