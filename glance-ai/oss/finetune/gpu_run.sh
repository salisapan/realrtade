#!/usr/bin/env bash
# =====================================================================================================================
#  PARKED (2026-10-08 01:56 IL): the user deferred renting a GPU. Do NOT run `run` on a rented machine until there are
#  >= 200 owner-verified labels (ownerVerified gold) and the user approves the spend again. `pack` and `dryrun` are safe.
# =====================================================================================================================
# Glance judge LoRA v2 on 1x A100 80GB (RunPod, default PyTorch image). One script, three modes:
#   ./gpu_run.sh pack              (on the box)  build gpu-bundle.tar.gz: code + SFT v2 data + cases + llama.cpp converter/quantize. No network.
#   ./gpu_run.sh run               (on the pod)  setup -> train LoRA (SFT v2) -> merge -> GGUF (--no-mtp) -> eval (same harness) -> pack artifacts
#                                                -> stop the pod. A watchdog stops the pod at MAX_MIN no matter what (spend cap).
#   ./gpu_run.sh dryrun            (on the box)  bash syntax, bundle contents, tokenizer/step count on SFT v2, every command printed, nothing rented.
#   ./gpu_run.sh score <tag>       (on the box)  after copy-back: score llm-<tag>.jsonl with the propose-gate + pass bar.
# Env knobs: PRICE_PER_H (default 1.89, RunPod Secure A100 80GB upper bound), CAP_USD (30), MAX_MIN (derived), TERMINATE=1 (remove pod
# instead of stop), GRACE_MIN (30: time left for copy-back before the final stop), CONFIG (qwen3.5-4b), TAG (ft-v2-qwen3.5-4b).
set -euo pipefail
MODE=${1:-help}
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; OSS="$ROOT/oss"
# llama.cpp is not vendored. When GPU work is unparked, clone it into $LLAMA_CPP_DIR (gitignored).
LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$OSS/finetune/tools/llama.cpp}"
CONFIG=${CONFIG:-qwen3.5-4b}; TAG=${TAG:-ft-v2-qwen3.5-4b}; BASE=${BASE:-Qwen/Qwen3.5-4B}
PRICE_PER_H=${PRICE_PER_H:-1.89}; CAP_USD=${CAP_USD:-30}; GRACE_MIN=${GRACE_MIN:-30}
# hard wall clock: 80% of the cap at the hourly price, never more than 6 h (expected 1.5-4 h)
MAX_MIN=${MAX_MIN:-$(python3 -c "print(min(360, int(0.8*$CAP_USD/$PRICE_PER_H*60)))")}
OUT=${OUT:-/workspace/glance-out}; LOG=$OUT/gpu_run.log
say() { echo "[$(TZ=Asia/Jerusalem date '+%F %T IL')] $*" | tee -a "${LOG:-/dev/stderr}" >&2; }

stop_pod() {  # stop GPU billing. RunPod injects RUNPOD_POD_ID + an API key into every pod; runpodctl ships in the image.
  local why=$1; say "STOP ($why)"
  [ "${DRY:-0}" = 1 ] && { say "dry: would run runpodctl $([ "${TERMINATE:-0}" = 1 ] && echo remove || echo stop) pod \$RUNPOD_POD_ID"; return 0; }
  sync || true
  if command -v runpodctl >/dev/null && [ -n "${RUNPOD_POD_ID:-}" ]; then
    if [ "${TERMINATE:-0}" = 1 ]; then runpodctl remove pod "$RUNPOD_POD_ID" || true; else runpodctl stop pod "$RUNPOD_POD_ID" || true; fi
  fi
  # fallback if runpodctl is missing: power off the container (pod keeps billing storage only once stopped from the console)
  shutdown -h now 2>/dev/null || kill -TERM 1 2>/dev/null || true
}

do_pack() {  # on the box: everything the pod needs, nothing secret, no model weights (the pod pulls the public base model itself)
  cd "$ROOT"
  local B=$HERE/gpu-bundle.tar.gz
  if [ ! -d "$LLAMA_CPP_DIR/gguf-py" ]; then echo "llama.cpp is not in git. Clone it to $LLAMA_CPP_DIR before pack. GPU stays parked."; exit 2; fi
  if [ ! -f "$OSS/finetune/data/v2/sft_train.jsonl" ]; then echo "SFT train jsonl is not in git (regenerate with build_sft_v2.py). Val is eval-data/sft-v2-val.jsonl."; exit 2; fi
  tar --exclude='__pycache__' -czf "$B" \
    oss/finetune/{train_lora.py,eval_sft.py,merge_export.sh,prompt_v2.py,build_sft_v2.py,build_sft_v2.cjs,gpu_run.sh,GPU-RUNBOOK.md} \
    oss/finetune/data/v2/{sft_train.jsonl,sft_val.jsonl,manifest.json} \
    oss/eval/{prompt.py,score.py,eval.jsonl,core_subset.txt} \
    eval-data/shadow-combined-cases.jsonl oss/shadow-combined/llm-qwen3.5-4b.jsonl oss/shadow-combined/gated/{score-gated.cjs,relabel.cjs,relabels.json} \
    oss/veto/{llm-veto.cjs,propose-gate.cjs,test-propose-gate.cjs} \
    model/suggest-save/suggest-save.js model/runtime/{veto-v2.cjs,veto.cjs,product-rules.cjs,addressee.cjs} \
    oss/finetune/tools/llama.cpp/convert_hf_to_gguf.py oss/finetune/tools/llama.cpp/gguf-py
  ls -la "$B"; tar -tzf "$B" | wc -l
  echo "copy to the pod:  scp -P <port> $B root@<pod-ip>:/workspace/   (or: runpodctl send $B)"
}

do_setup() {
  say "setup: GPU, python deps (flash-linear-attention + causal-conv1d for the Gated-DeltaNet layers), node for scoring"
  nvidia-smi --query-gpu=name,memory.total --format=csv | tee -a "$LOG"
  python -m pip install -q --upgrade pip
  python -m pip install -q "transformers==5.19.0" "peft==0.21.2" "accelerate==1.15.0" sentencepiece protobuf
  python -m pip install -q flash-linear-attention
  python -m pip install -q --no-build-isolation causal-conv1d || say "WARN causal-conv1d build failed: training falls back to the torch path (slower, still correct)"
  python -m pip install -q -e "$OSS/finetune/tools/llama.cpp/gguf-py"
  python - <<'PY' 2>&1 | tee -a "$LOG"
import torch, transformers, peft
print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '-')
for m in ('fla', 'causal_conv1d'):
    try: __import__(m); print(m, 'OK')
    except Exception as e: print(m, 'MISSING', e)
PY
  command -v node >/dev/null || { apt-get update -qq && apt-get install -y -qq nodejs >/dev/null || say "WARN no node: score on the box after copy-back"; }
  mkdir -p "$OSS/.venv/bin"; ln -sf "$(command -v python)" "$OSS/.venv/bin/python"   # merge_export.sh expects ../.venv/bin/python
}

do_train() {
  cd "$OSS/finetune"
  say "train: $CONFIG on SFT v2 ($(wc -l < data/v2/sft_train.jsonl) train / $(wc -l < data/v2/sft_val.jsonl) val)"
  # the pod downloads the PUBLIC base weights (~9 GB, no account) on first from_pretrained; the box only has the tokenizer cached
  timeout $(( (MAX_MIN - 40) * 60 )) python train_lora.py --config "$CONFIG" --train data/v2/sft_train.jsonl --val data/v2/sft_val.jsonl --out "runs/$TAG" 2>&1 | tee -a "$LOG"
  test -f "runs/$TAG/adapter/adapter_config.json"
}

do_export() {
  cd "$OSS/finetune"; say "merge + GGUF (--no-mtp) + Q8_0/Q4_K_M"
  ./merge_export.sh "$BASE" "runs/$TAG/adapter" "$TAG" 2>&1 | tee -a "$LOG"
}

do_eval() {
  cd "$OSS/finetune"; say "eval: same harness (eval_sft.py --prompt-version v2, HF bf16 + adapter on GPU) on OSS 275 + every shadow case"
  python eval_sft.py --backend hf --base "$BASE" --adapter "runs/$TAG/adapter" --tag "$TAG" --prompt-version v2 --cases 2>&1 | tee -a "$LOG"
  if command -v node >/dev/null; then
    say "score: propose-gate, spec labels, pass bar = 0 wrong-Do-It on every set + v2 held-out 400 missed <= ${MISS_BAR:-20}/182"
    (cd "$OSS/shadow-combined/gated" && MISS_BAR=${MISS_BAR:-20} node score-gated.cjs "$TAG" | tail -3) 2>&1 | tee -a "$LOG" || true
  fi
}

do_artifacts() {
  cd "$OSS"; say "artifacts -> $OUT"
  tar -czf "$OUT/$TAG-artifacts.tar.gz" finetune/runs/"$TAG"/{adapter,train_summary.json,data_info.json} finetune/gguf/"$TAG"-Q4_K_M.gguf \
    results/pred-"$TAG"-schema.jsonl shadow-combined/llm-"$TAG".jsonl $(ls -d shadow-combined/gated/"$TAG" 2>/dev/null) 2>/dev/null || true
  cp "$LOG" "$OUT/" 2>/dev/null || true; ls -la "$OUT" | tee -a "$LOG"
  say "copy back NOW (from the box):  scp -P <port> root@<pod-ip>:$OUT/$TAG-artifacts.tar.gz glance-ai/oss/finetune/   (or runpodctl send)"
}

do_run() {
  mkdir -p "$OUT"; : > "$LOG"
  say "RUN start  config=$CONFIG tag=$TAG price=\$$PRICE_PER_H/h cap=\$$CAP_USD  -> hard stop after $MAX_MIN min (max spend ~\$$(python3 -c "print(round($MAX_MIN/60*$PRICE_PER_H,2))"))"
  [ -f "$OSS/finetune/data/v2/sft_train.jsonl" ] || { say "SFT train is not in this tree. Extract the bundle so $ROOT contains oss/ and model/. GPU stays parked until the owner approves spend."; exit 2; }
  ( sleep $(( MAX_MIN * 60 )); stop_pod "watchdog: $MAX_MIN min wall clock reached" ) & WATCHDOG=$!
  trap 'say "error/exit trap"; do_artifacts || true; ( sleep $((GRACE_MIN*60)); stop_pod "after failure + ${GRACE_MIN} min grace" ) &' ERR
  do_setup; do_train; do_export; do_eval; do_artifacts
  say "DONE. Pod stops in $GRACE_MIN min (copy-back window). Watchdog pid $WATCHDOG still armed."
  sleep $(( GRACE_MIN * 60 )); stop_pod "normal end"
}

do_dryrun() {
  DRY=1; LOG=/tmp/gpu_run-dry.log; : > "$LOG"
  say "dryrun: bash -n"; bash -n "$0" && say "syntax OK"
  say "dryrun: hard stop would be $MAX_MIN min at \$$PRICE_PER_H/h (cap \$$CAP_USD)"
  say "dryrun: pack"; do_pack | tail -3
  say "dryrun: step count on SFT v2 with the 4B tokenizer (cached tokenizer only, no weights)"
  (cd "$OSS/finetune" && OMP_NUM_THREADS=3 ../.venv/bin/python train_lora.py --config "$CONFIG" --train data/v2/sft_train.jsonl --val data/v2/sft_val.jsonl --out /tmp/dry-$TAG --dry-run 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d[k] for k in ['n_train','n_val','truncated','tok_p95','train_tokens_per_epoch','optimizer_steps']})")
  say "dryrun: gate tests"; node "$OSS/veto/test-propose-gate.cjs" | tail -1
  say "dryrun: pass-bar scorer on the cached zero-shot 4B predictions"; (cd "$OSS/shadow-combined/gated" && node score-gated.cjs | tail -1)
  say "dryrun: stop path"; stop_pod "dry"
  for f in do_setup do_train do_export do_eval do_artifacts; do say "would run: $f"; done
}

case "$MODE" in
  pack) do_pack ;;
  run) do_run ;;
  dryrun) do_dryrun ;;
  score) cd "$OSS/shadow-combined/gated" && node score-gated.cjs "${2:?tag}" | tail -3 ;;
  *) sed -n '2,16p' "$0" ;;
esac
