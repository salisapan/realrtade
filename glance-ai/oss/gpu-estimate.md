# Glance judge — GPU estimate for the real LoRA on Qwen3.5-4B (2026-10-08)

**סיכום בעברית (להחלטת הוצאה)**
- המטרה: LoRA אחד על Qwen3.5-4B עם סט ה-SFT שלנו (9,432 דוגמאות, ‎6.3M טוקנים לאפוק, 2 אפוקים = ‎12.6M טוקנים).
- ההמלצה: כרטיס אחד A100 80GB (חלופה זולה: L40S 48GB; מהירה: H100 80GB). אין צורך ביותר מכרטיס אחד.
- זמן משוער לריצה: כ-1–2 שעות אימון + כ-0.7 שעה הקמה/מיזוג/ייצוא/בדיקה = כ-1.5–3 שעות שעון.
- עלות לריצה: כ-$1.5–5 על A100 80GB (RunPod/Vast.ai), עד כ-$7 על H100 ב-Lambda.
- שלוש ריצות (כוונון LR/יחס שתיקה + ריצה סופית): כ-$4–14; מומלץ לאשר תקרה של $30 כולל אחסון ומרווח.
- המחירים נבדקו ב-8.10.2026 ב-01:15 (שעון ישראל) באתרי RunPod, Lambda ו-Vast.ai (קישורים למטה). לא נפתח חשבון ולא שולם דבר.
- הסקריפטים (train_lora.py / eval_sft.py / merge_export.sh) עברו בדיקת עשן מקצה לקצה על Qwen3.5-0.8B ב-CPU אחרי 2 תיקונים (פרטים ב-REPORT.md, סעיף 2026-10-08).

---

## 1. What the run is
| item | value |
|---|---|
| base | `Qwen/Qwen3.5-4B` (text part: 32 layers, hidden 2560, 3:1 Gated-DeltaNet : full attention, vocab 248,320, tied embeddings; ≈3.1B non-embedding + 0.64B embedding params) |
| method | LoRA r=16, α=32, all text linear layers, bf16, gradient checkpointing (`finetune/train_lora.py --config qwen3.5-4b`) |
| data | `finetune/data/sft_train.jsonl` 9,432 rows / `sft_val.jsonl` 1,426 rows (zero-shot prompt, silence ratio 1.5) |
| tokens | **6,297,125 train tokens per epoch** (p50 663 / p95 711 / max 769 tokens per row, 0 truncated at 1024) → 2 epochs = **12.6M tokens**; loss is only on the ~20–40 answer tokens per row |
| steps | effective batch 32 (4 × 8 accum) → **590 optimizer steps** |

## 2. Compute estimate
- Training FLOPs ≈ 6 × 3.1B (fwd + recompute + bwd, frozen base) + lm-head (248k vocab, ~3.8 GFLOP/token) ≈ **22 GFLOP/token × 12.6M ≈ 2.8e17**, +~10% for 10 in-training evals on the val set ≈ **3.1e17 FLOP**.
- Realistic utilisation for a small-batch HF/PEFT run is 25–40% of bf16 peak. Qwen3.5's Gated-DeltaNet layers need the `flash-linear-attention` + `causal-conv1d` kernels; without them HF falls back to a slow torch path (budget up to 2× on the upper bound).
- Memory: bf16 weights ≈ 8 GB + LoRA/optimizer < 0.5 GB + logits (4 × ~720 × 248k fp32 ≈ 3 GB, ×2 for grads) + checkpointed activations → ~16–20 GB at batch 4. Fits 24 GB only with batch 2 × accum 16; comfortable on 40/48/80 GB.

| GPU (1×) | bf16 dense peak | est. training time | + overhead (setup, 8 GB download, merge→GGUF→Q4, eval) | wall per run |
|---|---|---|---|---|
| H100 SXM 80GB | 989 TFLOPS | 0.3–0.9 h | ~0.7 h | **1.0–1.6 h** |
| **A100 80GB** (recommended) | 312 TFLOPS | 0.7–2.2 h | ~0.7 h | **1.4–2.9 h** |
| A100 40GB | 312 TFLOPS | 0.7–2.2 h (batch 2 × 16) | ~0.7 h | 1.4–2.9 h |
| L40S 48GB | 362 TFLOPS | 0.8–2.4 h | ~0.7 h | 1.5–3.1 h |
| RTX 4090 24GB | ~83 TFLOPS (fp32-accum) | 2.5–5 h (batch 2 × 16) | ~0.7 h | 3.2–5.7 h |

Recommendation: **1× A100 80GB**. It runs the config as written (batch 4, max_len 1024, 248k-vocab logits) without memory tuning, bf16 and the DeltaNet kernels are mature on Ampere, and at $1–1.6/h it is the best cost/risk point. L40S is the cheapest acceptable alternative; H100 only if wall time matters more than ~$2/run. 4090 works but needs batch tuning and is not cheaper overall.

## 3. On-demand prices (checked 2026-10-08 ~01:15 IL; per GPU-hour, USD, before tax)
| provider | H100 80GB | A100 80GB | A100 40GB | L40S 48GB | RTX 4090 24GB | source |
|---|---|---|---|---|---|---|
| RunPod Secure Cloud | $3.49 (SXM) / $2.89 (PCIe) | $1.59 (SXM or PCIe) | — | $1.09 | $0.74 | https://www.runpod.io/pricing (page "Updated September 27, 2026") |
| RunPod Community Cloud | $2.69 (SXM) / $1.99 (PCIe) | $1.39 (SXM) / $1.19 (PCIe) | — | $0.79 | $0.34 | same page |
| Lambda (1× instance) | $4.29 (SXM) / $3.29 (PCIe) | (80GB only in 8× nodes, $2.79/GPU) | $1.99 | — (A6000 48GB $1.09) | — | https://lambda.ai/pricing |
| Vast.ai marketplace, on-demand, 1 GPU, host reliability ≥ 98% (live API query) | $2.00 min / $2.87 median (SXM, 5 offers) | $0.78 min / ~$1.00–1.06 median (14 offers) | $0.40 min / $0.54–0.72 median | $0.60 min / $0.74 median | $0.33 min / $0.43 median | https://vast.ai/pricing (live listing via the public `console.vast.ai/api/v0/bundles` search the Vast CLI uses) |

Vast prices are a marketplace and move hourly; RunPod/Lambda are list prices. Storage/egress are extra but small (RunPod volume $0.10/GB/month; ~30 GB for model + merged + GGUFs ≈ <$1 for a few days).

## 4. Cost per run and for ~3 runs
| option | wall per run | $ per run | $ for 3 runs |
|---|---|---|---|
| **A100 80GB, RunPod Secure $1.59** | 1.4–2.9 h | **$2.2–4.6** | **$7–14** |
| A100 80GB, Vast.ai ~$1.00 | 1.4–2.9 h | $1.4–2.9 | $4–9 |
| L40S, RunPod Secure $1.09 | 1.5–3.1 h | $1.6–3.4 | $5–10 |
| H100 SXM, RunPod Secure $3.49 | 1.0–1.6 h | $3.5–5.6 | $10–17 |
| H100 SXM, Lambda $4.29 | 1.0–1.6 h | $4.3–6.9 | $13–21 |
| A100 40GB, Lambda $1.99 | 1.4–2.9 h | $2.8–5.8 | $8–17 |

**Ask: approve up to $30 total** (3 runs on 1× A100 80GB + slack for a failed start, kernel install, storage). Expected actual spend ≈ $10–15.

## 5. Before paying (checklist)
1. `pip install flash-linear-attention causal-conv1d` on the GPU box. The CPU smoke run logged that transformers was falling back to the slow reference path for the Gated-DeltaNet layers; make sure that warning is gone (else expect up to 2× the time).
2. First 20 steps: check tokens/s and VRAM, extrapolate; stop if > 3 h projected.
3. After training: `merge_export.sh` → Q4_K_M GGUF → `eval_sft.py --backend server --cases` → `node shadow-combined/combine.cjs ft-qwen3.5-4b` on the box. Only CORE162 and the v2 held-out are clean (non-core OSS rows are in the SFT train set).
4. Shut the pod down right after export (per-second/per-minute billing).
