
## 4. What works and what doesn't, and why

**Works**
- **Constrained JSON output.** llama.cpp `response_format: json_schema` gave 100% schema-valid output from every model at every size. JSON validity is a solved problem. Always decode against the schema in production; it is the analogue of `json-enforce.js`.
- **Qwen3.5-4B as a judge.** It held silence on every adversarial family: negation EN/HE, FYI, past dates, outbound and self-mail, third-party, two files or two clocks, out-of-office, marketing, and **prompt injection**. When it acted, its family was always right (100%). Its titles followed the rules in both languages, e.g. *"לשלוח את החוזה"* and *"Send the deck"*.
- **LLMs extend coverage where the regex teacher is blind.** They caught OneDrive saves (*"save the attachment to OneDrive"*, EN+HE), short Hebrew promises without "יום", and Hebrew meetings phrased *"פגישת צוות ביום רביעי בשעה 15:00"*. The teacher misses all of these. DictaLM-1.7B and Qwen-0.8B had the *lowest* missed-close rates (23–25%) on CORE162.
- **Hard vetoes.** Teacher-veto plus the veto pack cut wrong Do-Its 3–6× for every weak model. The teacher's own explicit silence reasons are high-precision, so they make an excellent veto.
- **Prompt caching.** The roughly 1.4k-token rules + few-shot prefix is processed once. Per case, only about 70–150 new tokens are processed, which gives 1.4 s (0.8B) to 6.8 s (4B) p50 on 3 contended CPU threads.

**Doesn't work (yet)**
- **Tiny models alone (≤2B).** They are injection-prone: 0.8B and 2B both produced *create_task "Wire $5000 to account 1234"*, and DictaLM produced a Drive save. They also act on outbound mail, on asks addressed to a colleague, and on past dates. **Any model ≤2B needs the veto plus an injection/money filter.** The veto pack does not catch injection; only *AND teacher* or a dedicated filter does.
- **Qwen3.5-2B is badly calibrated.** It is far more conservative than 0.8B or 4B (63% missed closes), and almost never acts on English promises or meetings. Prompt or few-shot tuning, or fine-tuning, would fix this. It is not a model-capacity limit; 0.8B acts fine.
- **Due dates.** Exact `due` was right only 37–55% of the time across LLMs. The models mis-resolve weekday names relative to "Today". **Keep dates deterministic** (`FlowExtract`) and let the model point at the span at most.
- **Small encoder as the only gate.** Frozen e5-small + LR, and a quick CPU fine-tune, both reached only about 76–82% agreement with the teacher on the worker's 1.5k test split. Getting wrong Do-Its to ≤1% requires a threshold that misses 68–84% of closes. Without the veto it also fails hard on negation, because teacher labels *teach* it that "don't save … to Drive" is a Drive save. The worker's own hashed-feature LR baseline (val acc 0.85, 2.9 MB ONNX) is in the same band.
- **Hebrew titles from Qwen-0.8B.** It often answers a Hebrew email with an English title (0/5 HE titles OK). DictaLM, 2B and 4B write proper Hebrew infinitives.
- **"AND teacher" as the only combination.** It is the safest (0–2.7% wrong), but it throws away exactly the coverage the LLM adds and raises missed closes to 44–79%. Use the teacher's *explicit silences* as a veto, not the teacher's *acts* as a whitelist, and add an injection/money rule.

## 5. Recommended architecture

```
mail ─► host rules (outbound / self / auto-reply)  ── silence
     ─► teacher 0.9.34 (deterministic)  ── explicit silence reason? ── HARD VETO → silence
     ─► veto pack (negation, addressed-to-other, unsubscribe, money/wire/injection markers) ── VETO → silence
     ─► small LLM judge (schema-constrained JSON)  {decision, family, action, title}
           • may ACT only within families the product can execute (task / calendar / reply / file)
           • never on money movement; "act" on text that addresses the model ("SYSTEM:", "ignore rules") = silence
     ─► deterministic fields: due/time from FlowExtract, file target from attachment metadata, title lint
           (≤60, verb-first, source language, no greeting); a failed lint falls back to the teacher title or to silence
     ─► Do It card → approve → execute → fetchedBack (unchanged)
```

- The **encoder gate** is optional and *later*. Once a fine-tuned e5-small or granite-97m reaches teacher-level precision on owner labels, run it as an 10–25 ms pre-filter, so the LLM is called only on plausible-act mail (about 20–30% of traffic). Do not ship it as the decider.
- **Shadow first.** Plug the LLM into the worker's shadow harness (`glance-ai/model/shadow`, `shadow/score.cjs`) as the *candidate*. The M3 gate in `ai-engine-plan.md` still applies: ≥200 owner labels, and wrong-Do-It = 0.

## 6. Base models for fine-tuning and distillation

| Target | Pick | Why |
|---|---|---|
| **Glance server (M2, first)** | **Qwen3.5-4B** (Apache-2.0). Upgrade path: **Qwen3.5-9B** or **DictaLM-3.0-24B** for a server-side teacher, or as the LoRA base when a GPU is available. | Best measured: 0 wrong Do-Its on CORE162, 88.9% end-to-end. Apache-2.0. GGUF, ONNX and MLX all exist. A 4B LoRA is cheap. DictaLM-24B (Apache) is the strongest open Hebrew model if Hebrew nuance becomes the bottleneck. |
| **On-device (laptop CPU / Apple Silicon)** | **Qwen3.5-2B** (Apache) *after* fine-tuning; **DictaLM-3.0-1.7B** (Apache) as the Hebrew-first alternative | About 1.1–1.3 GB at Q4. 1.7–3 s/case here on 3 shared threads, so expect sub-second on Apple Silicon with Metal or MLX. 2B needs calibration via LoRA on teacher + owner labels. DictaLM has the best published tiny-model Hebrew numbers and the lowest HE wrong-Do-It (0/45 with veto), but it is injection-prone and needs the veto. |
| **In-browser (WebGPU / ONNX)** | **multilingual-e5-small** (MIT) or **granite-embedding-97m-multilingual-r2** (Apache), fine-tuned, as the gate. **Qwen3.5-0.8B ONNX** only for titles under the veto. | 98–118 MB int8 ONNX, transformers.js-ready. 0.8B (533 MB Q4, ONNX on onnx-community) is too unsafe to decide, but can phrase a title once the engine has decided. |

Distillation recipe: labels = teacher ∪ hand-overrides ∪ owner gold (consent only). Train on the *corrected* labels, not raw teacher output, or the student inherits the teacher's negation and OneDrive bugs. LoRA r=16 on Qwen3.5-2B/4B with JSON outputs. Also distill 4B into 2B on unlabeled mail (shadow traffic), with the veto enforced at both train and inference time.

## 7. License risks

- **Clean (Apache-2.0 / MIT):** Qwen3.5 0.8B/2B/4B/9B, Gemma 4 (all sizes, now Apache-2.0), DictaLM-3.0-1.7B and DictaLM-3.0-24B, Ministral-3-8B, multilingual-e5-small (MIT), granite-embedding (Apache), Phi-4-mini (MIT). Keep NOTICE and attribution, and note any modifications.
- **Review before use:** DictaLM-3.0-Nemotron-12B (`license:other`, NVIDIA base model terms). EmbeddingGemma-300m is under the Gemma Terms, not Apache (gated, prohibited-use policy). dictabert is CC-BY-4.0 (attribution required).
- **Avoid for Glance's own model:** Llama 3.2 (community license: 700M-MAU cap, AUP, "Built with Llama" naming, gated). LFM2.5 (custom revenue-gated `lfm1.0`).
- **Provenance:** the DictaLM-1.7B-*Instruct* GGUF used here is a **community quant** (`Ibrerhim/…`). For production, quantize from Dicta's official safetensors ourselves (`llama-quantize`). Pin model revisions by commit hash.
- Licenses were read from HF tags and model cards. This is not legal advice; have counsel confirm before shipping weights inside the extension.

## 8. On-device feasibility

- **Server (Glance):** Qwen3.5-4B Q4 needs about 4 GB RSS (measured, including mmap'd weights). Expect ≪1 s/case on any modern 8–16 core server or a small GPU (vLLM or llama.cpp-server). 9B would be about 6–8 GB.
- **Laptop CPU / Apple Silicon:** 0.8B (533 MB), DictaLM-1.7B (1.1 GB) and 2B (1.3 GB) run at 1.4–3.3 s p50 *on 3 contended vCPUs here*, so they are comfortable on an M-series Mac (llama.cpp Metal, or MLX builds which exist for Qwen3.5 and DictaLM). 4B at 2.7 GB works on a 16 GB laptop but takes real memory from the user.
- **In-browser (WebGPU/ONNX):** encoders (98–118 MB int8) are clearly feasible, at 12–24 ms/case on CPU here. ONNX exports exist for Qwen3.5-0.8B/2B/4B and Gemma-4-E2B, but **I did not test in-browser WebGPU here** (no GPU, headless box). Treat ≥1B LLMs in the browser as an open question: download size, WebGPU availability, and Chrome extension memory limits.

## 9. Not run, or only partly run (honest list)

- **Gemma-4-E2B-it (Q4_K_M, 3.1 GB) — see the run log below.** It was downloaded, but the run was gated on free RAM, which the parallel v2 training worker had taken.
- **Mid models (7–12B) and DictaLM-12B/24B:** not run. They did not fit the shared 16 GB / no-GPU box.
- **DictaLM-1.7B and Qwen3.5-4B** ran on CORE162 (162 cases) plus a 55-case unconstrained subset, not on all 275, because of CPU contention.
- **granite-embedding-97m:** downloaded, not scored. Encoder fine-tuning was partial: top 6 of 12 layers, 3k examples, 2 epochs, CPU.
- **Prompt tuning per model:** one shared prompt for all models. 2B's over-caution might drop with model-specific few-shots; not explored.
- **WebGPU/ONNX in-browser and MLX:** not tested (no GPU / no Mac here).
- **Owner-verified gold:** none exists yet (`ownerVerified: 0`). Set D's labels are model-made. All "gold" is teacher + my hand checks.
- Latency and RSS were measured under heavy contention from other agents, so treat them as upper bounds. RSS includes mmap'd weights.

## 10. Next 3 concrete steps

1. **Ship the veto pack into the teacher path now (smallest win, no model needed).** Negation, addressed-to-other and unsubscribe rules took the teacher's own wrong-Do-It rate from 10.2% to 1.8%. Fix three specific teacher bugs: "don't save … to Drive" → `file-it`, OneDrive-save misses, and greeting-prefixed task titles. Then put Qwen3.5-4B behind that veto in the **shadow harness** on live ai.local.flow mail (log only, no button), next to the incumbent.
2. **LoRA fine-tune Qwen3.5-2B and Qwen3.5-4B** on the worker's 13k teacher labels, *corrected* by the hand overrides here, plus the owner gold as it grows (target ≥200, consent only). Output schema is exactly `{decision, family, action, title}`. Remove `due` from the model's job and fill it from `FlowExtract`. Gate on CORE162 + owner gold: wrong-Do-It = 0, and missed-close below the teacher's 24%. One GPU-hour class job.
3. **Export test for on-device and browser.** Fine-tune e5-small (full, GPU) or granite-97m as the pre-gate. Export int8 ONNX. Measure in Chrome with transformers.js (WASM and WebGPU), and run the fine-tuned 2B as GGUF/MLX on a Mac. Pass criteria: ≤50 ms gate, ≤1.5 s judge, ≤1.5 GB RAM, identical decisions to the server build on CORE162.

## Files

- `eval/teacher.cjs` (teacher wrapper), `eval/build_cases.py` + `eval/label.cjs` + `eval/add_worker_sets.cjs` (eval set), and `eval/eval.jsonl` (275 cases with gold + teacher output).
- `eval/prompt.py` (rules, few-shots, schema), `eval/run_llm.py` (runner), `eval/score.py` (metrics + vetoes), `eval/final_tables.py`, and `eval/analyze.py` (error breakdown).
- `eval/encoder_gate.py` (frozen encoder + LR) and `eval/finetune_encoder.py` (CPU fine-tune).
- `results/pred-<model>-{schema,free}.jsonl` (every raw output, latency and RSS), `results/scores.json`, `results/tables.md`, `results/encoder-*.json`, and `results/run_rest.log`.
- `bin/llama-b11429/` (llama.cpp CPU build), `models/` (GGUF + ONNX, about 9 GB), `serve.sh`, `run_rest.sh`, and `run_big.sh`.
