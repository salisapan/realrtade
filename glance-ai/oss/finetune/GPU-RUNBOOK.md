# PARKED — GPU runbook: Glance judge LoRA v2 (Qwen3.5-4B) on 1× A100 80GB

> **PARKED (2026-10-08 01:56 IL).** The user deferred renting a GPU. Do not rent anything or run `gpu_run.sh run` until there are
> **≥ 200 owner-verified labels** (today: 0), the SFT/eval sets have been refreshed with them, and the user approves the spend again.
> Nothing here needs a signup from this box; the RunPod account and pod are the user's to create when un-parked.
> Only the safe parts were exercised: `gpu_run.sh dryrun` and `gpu_run.sh pack` (see "Dry-run results" below).

One script does everything: `finetune/gpu_run.sh` (`pack` on the box, `run` on the pod, `dryrun` on the box, `score <tag>` on the box).

## 0. Budget and hard stop
- Cap: **$30**. Price assumed: **$1.89/h** (upper bound, RunPod Secure A100 80GB; Community is about $1.19–1.39/h).
- `gpu_run.sh run` arms a watchdog at start: **MAX_MIN = min(360, 0.8 × CAP / PRICE × 60)** = 360 min, so at most about **$11.3** per run.
  When it fires it runs `runpodctl stop pod $RUNPOD_POD_ID` (set `TERMINATE=1` to remove the pod instead).
- Normal end: artifacts are packed, then the pod stops after a **30-min copy-back window** (`GRACE_MIN`). On any error the ERR trap
  packs whatever exists and stops after the same window.
- Expected wall time: 1.5–4 h. SFT v2 has 11,351 train rows and 10.1M tokens per epoch (p95 933 tokens, 0 truncated at 1024).
  Two epochs at an effective batch of 32 is 710 optimizer steps. That is about $3–8 per run and leaves room for a second run under the cap.
- Belt and braces: also set the RunPod account spend limit / auto-stop in the console, and check the pod is gone afterwards.

## 1. Pack on the box (no network)
```
cd glance-ai/oss/finetune && ./gpu_run.sh pack      # -> gpu-bundle.tar.gz (~20 MB, 233 files)
```
The bundle contains the code, SFT v2 (`data/v2/`), the eval + shadow cases, the propose-gate scorer, the llama.cpp converter (`--no-mtp`)
and `llama-quantize`. It holds **no model weights and no secrets**.

## 2. Create the pod (user, in the RunPod console)
- 1× A100 80GB, template **RunPod PyTorch** (default image), ≥ 60 GB container disk (base 9 GB + merged 8 GB + GGUF bf16 8 GB + Q8/Q4).
- Copy the bundle: `scp -P <port> gpu-bundle.tar.gz root@<pod-ip>:/workspace/`, or `runpodctl send gpu-bundle.tar.gz` (a one-time code, no account on the receiving side).

## 3. Run on the pod
```
# Extract so the directory contains oss/ and model/. In this repo that directory is glance-ai/.
mkdir -p glance-ai && tar -xzf /workspace/gpu-bundle.tar.gz -C glance-ai
cd glance-ai/oss/finetune
PRICE_PER_H=1.89 CAP_USD=30 nohup ./gpu_run.sh run > /workspace/run.out 2>&1 &
tail -f /workspace/glance-out/gpu_run.log
```
llama.cpp is not in git. Clone it into `glance-ai/oss/finetune/tools/llama.cpp` (gitignored) before `pack`. Do not run `gpu_run.sh run` while this note says PARKED.
What `run` does, in order:
1. **Setup:** `nvidia-smi`; installs `transformers==5.19.0 peft==0.21.2 accelerate==1.15.0` (same versions as the box smoke test),
   **`flash-linear-attention`** and **`causal-conv1d`** (for the Gated-DeltaNet kernels; if causal-conv1d fails to build it warns and
   uses the slower torch path), gguf-py, and nodejs for scoring. Then it prints whether `fla` and `causal_conv1d` import.
2. **Train:** `train_lora.py --config qwen3.5-4b --train data/v2/sft_train.jsonl --val data/v2/sft_val.jsonl` (LoRA r16/α32,
   all text linear layers, bf16, gradient checkpointing, lr 1e-4, 2 epochs). It runs under `timeout` (MAX_MIN − 40 min).
   **The pod downloads the public base weights `Qwen/Qwen3.5-4B` (~9 GB) from Hugging Face.** This box only has the 4B tokenizer and
   the 4B GGUF cached, not the HF weights, and nothing is downloaded on the box.
3. **Merge + export:** `merge_export.sh Qwen/Qwen3.5-4B runs/<tag>/adapter <tag>` → merged bf16 → `convert_hf_to_gguf.py --no-mtp`
   → Q8_0 + **Q4_K_M** GGUF.
4. **Eval in the same harness:** `eval_sft.py --backend hf --prompt-version v2 --cases` (base + adapter, bf16 on GPU) over OSS 275 and
   all 431 shadow cases that reach the LLM. This writes `shadow-combined/llm-<tag>.jsonl`, then
   `shadow-combined/gated/score-gated.cjs <tag>` scores **engine+veto → LoRA, propose-only, behind the propose-gate**.
5. **Artifacts:** `/workspace/glance-out/<tag>-artifacts.tar.gz` holds the adapter, train summary, Q4_K_M GGUF, predictions and the score.

## 4. Pass bar (decided on the box, after copy-back)
Strict gate (real attachment list unread), spec labels (`gated/relabels.json`), full coverage (431/431 predictions):
- **0 wrong-Do-It on every set:** CORE162, OSS 275, v2 held-out 400, adversarial-v2 and the injection set.
- **v2 held-out 400 missed ≤ 20/182 (11.0%)**, the step-1 result of the zero-shot 4B behind the gate (`MISS_BAR=20`).
- Also report the LoRA's **ungated** wrong-Do-Its on v2 held-out (zero-shot 4B: 8/218). The goal is for SFT v2 to bring this near 0
  on its own, but the bar is the gated number.
- `score-gated.cjs` prints `PASS {...}` / `FAIL {...}` and exits 0 or 3. A partial run never passes.
- Optional production-parity check on the box: serve the Q4_K_M GGUF with the CPU llama-server (3 threads; check `free -g` ≥ 3 GB first),
  run `eval_sft.py --backend server --prompt-version v2 --cases --tag <tag>-q4`, then `./gpu_run.sh score <tag>-q4`. Stop the server afterwards.

## 5. Copy back, then make sure the pod is gone
```
scp -P <port> root@<pod-ip>:/workspace/glance-out/<tag>-artifacts.tar.gz glance-ai/oss/finetune/
tar -xzf <tag>-artifacts.tar.gz -C glance-ai/oss-models && ./gpu_run.sh score <tag>
```
Within the 30-min window, or stop the pod yourself right after copying. If `TERMINATE=1` was not set, **terminate the stopped pod in
the console**, because a stopped pod still bills for its disk.

## Dry-run results (box, 2026-10-08 ~02:00 IL)
- `bash -n` OK. `gpu_run.sh dryrun`: pack OK (233 files, 19.7 MB). Tokenizer step count on SFT v2: 11,351 / 1,637 rows, 0 truncated,
  710 steps. Gate tests ALL PASS. The pass-bar scorer on the cached zero-shot 4B predictions gives PASS (20/182, 0 wrong-Do-It).
  The stop path printed `runpodctl stop pod $RUNPOD_POD_ID` (dry).
- Bundle isolation: the bundle was extracted into an empty dir with paths rewritten; gate tests and the scorer ran from it alone.
- **Tiny real step (Qwen3.5-0.8B, CPU, 3 threads, bf16, a RAM watchdog that kills at < 3 GB available):** 2 optimizer steps on 8 SFT v2 rows
  at max-len 512. Val loss went from 2.65 to 1.68, wall time was 90 s and peak RSS 6.3 GB; the watchdog never fired. `eval_sft.py --backend hf
  --prompt-version v2 --cases --limit 2` ran. The 2-step model's JSON is invalid, which is expected. `score-gated.cjs` correctly reported
  **FAIL** (coverage 0/431). Outputs are in `finetune/runs/smoke-v2-0.8b/`.
- Not exercised locally: the CUDA installs (fla, causal-conv1d), the 4B download, merge/export at 4B, and runpodctl itself.
