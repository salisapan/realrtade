# Glance's own model: the track from data to promotion

Glance closes open loops. Gmail is where it starts today.

This page is the lab side of Glance's own model (`docs/glance-ai/ai-product.md`). Glance's model is an open model (Qwen3.5-4B, chosen in `../REPORT.md`) fine-tuned on Glance's own data, run on Glance cloud on masked text, behind the device's validator and gate. A model's answer is a proposal; it never closes, writes or sends.

## The track

| step | tool | state |
|---|---|---|
| 1. Data in the Understanding format, every claim a quote | `build_sft_v3_grounded.cjs` | built 2026-10-11 |
| 2. Fine-tune (LoRA, one A100 80GB, cap $30) | `train_lora.py`, `gpu_run.sh` (`GPU-RUNBOOK.md`) | built, **parked** until 200 owner-verified labels and the owner's spend approval |
| 3. Score a run | `eval_sft.py` (judge format); an Understanding run is scored by step 4 | built |
| 4. Promote or hold | `promote_gate.cjs` | built 2026-10-11 |

Tests: `node glance-ai/oss/finetune/test-model-track.cjs [--understanding <path>]`. The SFT v3 part needs `flow-trial-extension/core/understanding.js` (milestone M1, PR #128); until that merges, pass the path to a copy.

## Step 1: SFT v3, grounded

`node build_sft_v3_grounded.cjs [--in <sft-v2.jsonl>] [--out data/v3] [--understanding <path>] [--repair-dates]`

The same mails as SFT v2. The target becomes the Understanding contract: an act row gets one intention whose `ask_span` and `evidence_span` are the sentence of the mail that carries the ask, and whose `due_span` is the words the device itself reads as that date (widened to the time for a meeting). Every target is then read by the validator and `proposal()` exactly as the extension would read a model's answer. A row is kept only when the device reaches the same step as the label. Every other row is listed in `flags.jsonl` with the reason.

### Audit of the SFT v2 val set (2026-10-11, `eval-data/sft-v2-val.jsonl`, 1,637 rows, 476 act)

| finding | rows | what it means |
|---|---|---|
| "tomorrow", «מחר», "today", «היום», "by EOD" labelled one day late | 51 | the generator's reference day is one day after the "Today:" line the prompt shows |
| a weekday said the day before it ("by Thursday" on a Wednesday, «עד יום חמישי», «ביום רביעי הבא») labelled a week late | 35 | same root, plus the "next weekday" rule |
| the device reads no date where the label has one | 17 | typos in the mail ("Thussday", «ליבום שני») or words the parser does not read |
| reply asks with no date ("asap", «ASAP») labelled act | 61 | the device stays silent on an undated ask (`ask-without-date`); the spec says a reply needs a date or deadline |
| meeting labels with no time the device can read | 26 | includes generator noise: "The board approved ₪3,400 for the migration next Tuesday" labelled a meeting |
| promise labels with no date, or no sentence that carries the ask | 13 | generator noise: "The board approved $89 for the Q4 plan tomorrow" labelled a task |

In all, 207 of 476 act rows (43%) disagree with what the device reads; 86 of them (18% of act rows) teach a wrong date. Hebrew carries more of it (213 of 810 Hebrew rows flagged against 161 of 827 English). A model trained on these rows learns that «מחר» is two days away, which matches the M1 finding in PR #128: every Hebrew weekday date the cached model put on a card was wrong.

The train split (`data/v2/sft_train.jsonl`, about 11k rows, gitignored) comes from the same generator. It is not in this repository, so it is not measured here; expect the same pattern.

`--repair-dates` keeps a row whose ask sentence the device reads as a date exactly 1 or 7 days before the label, with the device's date (`meta.repaired`). At run time the device's reading of the quoted words wins anyway (`understanding.js`). On the val set: 1,493 kept, 63 repaired, 144 still flagged. Any other disagreement stays flagged, to be fixed in the generator, the label or the parser, never trained in.

## Step 4: the promotion gate

`node promote_gate.cjs --base <pred.jsonl> --cand <pred.jsonl> [--cases f] [--labels f] [--understanding f] [--strict]`

A new model replaces the current one only when, on the same cases: no more wrong Do Its (total, Hebrew, English), no more wrong actions, no more missed closes in either language and fewer in total, and at least 200 owner-verified labels among the labels it is judged on. Until there are 200, the best verdict is "better on spec labels" and `promote` is false. Predictions may be in the judge format or the Understanding format; an Understanding goes through the validator and `proposal()`, so the score is what the person would see.

## What waits on the owner

- 200 owner-verified labels (`glance-ai/labeling/`): today 0. This is what makes step 4 able to promote.
- The spend approval for one GPU run (cap $30, `gpu-estimate.md`).
- A decision on undated reply asks ("send the deck asap"): act (today's labels) or silence (today's device). The 61 rows wait on it.
