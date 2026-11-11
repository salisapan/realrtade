# Glance model scoreboard (Phase 0)

Glance closes open loops. Gmail is where it starts today.

Lab only. One command, the seven metrics of `docs/glance-ai/model-upgrade-plan.md`, by label source, Hebrew and English apart, with n and a 95% Wilson interval. Nothing is wired into the extension and nothing leaves the machine.

```sh
# engine environment of glance-ai/model/V23.md first (GLANCE_TIP, GLANCE_V2_ENGINE, GLANCE_NOW, GLANCE_ENGINE_ROOTS)
node glance-ai/scoreboard/run.cjs \
  --models v2=model/v23/base/base.test-preds.jsonl,v26=model/v2x/v26/v26.test-preds.jsonl \
  [--judged frontier-a=<cached predictions in judge format>] --md out.md --json out.json
```

- **Label sources, never mixed:** owner-verified, two-pass agreement (not owner-verified), single blind pass (Claude, not owner-verified). The generator's own reference is a training target, not a source.
- **`engine-only` is always the first row:** the rules engine plus veto with no model. Every model is read against it, because in the product order the engine acts first.
- **Two orders:** "engine+veto, then model" is what the person would see; "model alone" is the model by itself, with its gate calibration (ECE and Brier).
- **Metrics 4 (proof rate) and 7 (cost and latency) print n/a** until own-use data with `fetchedBack` read-back (path A) and the M6 measurement exist.
- **Frontier baselines:** `baseline/make-prompts.cjs` writes masked prompts (no model call); someone with a key and a spend cap runs them; `baseline/ingest.cjs` turns the cached outputs into `--judged` predictions. An answer that cannot be read counts as silent.
- **Real-mail frozen set:** `real-mail/README.md` (structure only; `private/` is gitignored).
- **Conventions the labels follow:** `docs/glance-ai/model-conventions.md`.
- `last-run.md` and `last-run.json` are the latest printed scoreboard (agreement labels n = 444, single-pass n = 500).
- Test: `node glance-ai/scoreboard/test-scoreboard.cjs`.

## Readings (frozen, text-bound label set; the earlier readings joined labels by positional id and are withdrawn, see `glance-ai/model/V23.md` CORRECTION)

**2026-11-11, full frozen set (batches 003 to 007), agreement labels n = 485 (264 silent, 221 act), product order, engine hard quiets as a veto on the model (`--hard-quiets A`); the zero-shot baseline was given the labelling rules as its prompt (as favourable as a prompt can be) and 88 of its 607 answers were CONTEXT or UNSURE, counted as silent:**

| system | wrong Do It | missed | wrong action |
|---|---|---|---|
| engine alone | 17 (6.4%) | 112 (50.7%) | 12 |
| engine + v2 (default) | 17 (6.4%) | 102 (46.2%) | 15 |
| engine + v2.3 | 17 (6.4%) | 82 (37.1%) | 17 |
| engine + v2.6 | 17 (6.4%) | 78 (35.3%) | 17 |
| engine + hard quiets, then zero-shot Claude | 19 (7.2%) | 5 (2.3%) | 31 |
| zero-shot Claude, alone | 26 (9.8%) | 9 (4.1%) | 33 |

Without the engine's hard quiets as a veto, v2.6 adds 3 wrong Do Its (asks addressed to another named person) and is HELD by the gate. The zero-shot Claude baseline was run by a fresh subagent on the masked frozen cases (no API key was available; its prompt showed no sender name). Labels are Claude's, so the baseline is favoured. **No claim that Glance beats a frontier model follows from this, and none should be made;** what the table shows is that the floor cuts a general model's wrong Do Its from 24 to 14 and keeps 97.7% of the closes.

- Contrast pairs and metamorphic checks: `contrast/README.md`. Regression ratchet of engine wrong Do Its: `node glance-ai/labeling/ratchet.cjs`.

**2026-11-11, first frontier-baseline reading (zero-shot Claude, Sonnet class, one pass, the rules of `baseline/make-prompts.cjs`, 252 masked test cases, 0 unreadable answers).** No API key was available (the session authenticates only the harness), so the baseline was run by a fresh subagent that saw only the prompts file; the answers were ingested by `baseline/ingest.cjs`. Agreement labels, n = 407:

| system | wrong Do It | missed | wrong action |
|---|---|---|---|
| Glance engine alone | 13 / 136 (9.6%) | 35 / 69 (50.7%) | 8 |
| Glance engine + v2.6 | 13 / 136 (9.6%) | 26 / 69 (37.7%) | 7 |
| Claude zero-shot, alone | 19 / 136 (14.0%) | 7 / 69 (10.1%) | 10 |
| engine first, then Claude zero-shot (no veto) | 28 / 136 (20.6%) | 4 / 69 (5.8%) | 10 |

Read it with care: (1) the labels were made by Claude passes under rules close to the baseline prompt, so the baseline is favoured; a frontier win here proves little, a frontier loss would prove a lot. (2) 15 of the 19 "wrong Do Its" are rows the labels call silent but that are label questions: seven save-to-Drive or OneDrive asks on a row with no attachment (the file chain is silent without one), six undated or «לפני החג» promises by the reader (C-18, C-3), two notes to self; 4 are real mistakes. (3) The trade is the point: a general model finds almost every close (missed 10%) and acts wrongly more often; Glance's rules and small model are precise and miss a lot (38%). The product design (Tier 2 model reading, then the device validator, strict gate and veto on every answer; `docs/glance-ai/ai-product.md`) is the way to take the recall without the wrong Do Its; its measured cost on the cached Qwen answers is in `ai-product.md` section 10. **No claim that Glance beats a frontier model follows from this, and none should be made.**


**Legacy id-keyed label files.** `labeling/agreement-gold.jsonl`, `batch-NNN.claude-labels.jsonl` and `batch-NNN.pass2-labels.jsonl` are keyed by the dataset row ids of the day they were made. Those ids are positional and move when the generator changes, so these files are history, not an evaluation input: the scoreboard reads `labeling/frozen-eval.jsonl` (text-bound, built by `model/train/export-frozen.cjs` from the batch files, which carry the text) and the overlay and ratchet use its ids. `promote_gate.cjs` itself is unchanged (it reads whatever cases and labels it is given); feed it frozen rows, never dataset ids.
