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

## Readings

**2026-11-11 (after the owner's C-4: an undated ask gets a Do It).** Agreement labels, n = 407 after 37 rows moved to the rule-derived source `labeling/owner-convention-overlay.jsonl`. The engine alone: 13 wrong Do Its of 136 silent rows (9.6%, interval 5.7% to 15.7%), none an undated ask any more; v2.6 adds none and cuts misses from 35 to 26 of 69. On the 21 decided act rows of the overlay the engine misses 8 and v2.6 alone misses all 21, because the gate's tau is above its confidence on real sentences. v2.8 (undated asks labelled act) adds 3 wrong Do Its on one open convention, C-18 (a reader's undated promise), so it is held. Details: `glance-ai/model/V23.md`.

Before C-4 the same run read 26 of 161 (16.1%), 13 of them undated asks.
- Contrast pairs and metamorphic checks: `contrast/README.md`. Regression ratchet of engine wrong Do Its: `node glance-ai/labeling/ratchet.cjs`.

**2026-11-11, first frontier-baseline reading (zero-shot Claude, Sonnet class, one pass, the rules of `baseline/make-prompts.cjs`, 252 masked test cases, 0 unreadable answers).** No API key was available (the session authenticates only the harness), so the baseline was run by a fresh subagent that saw only the prompts file; the answers were ingested by `baseline/ingest.cjs`. Agreement labels, n = 407:

| system | wrong Do It | missed | wrong action |
|---|---|---|---|
| Glance engine alone | 13 / 136 (9.6%) | 35 / 69 (50.7%) | 8 |
| Glance engine + v2.6 | 13 / 136 (9.6%) | 26 / 69 (37.7%) | 7 |
| Claude zero-shot, alone | 19 / 136 (14.0%) | 7 / 69 (10.1%) | 10 |
| engine first, then Claude zero-shot (no veto) | 28 / 136 (20.6%) | 4 / 69 (5.8%) | 10 |

Read it with care: (1) the labels were made by Claude passes under rules close to the baseline prompt, so the baseline is favoured; a frontier win here proves little, a frontier loss would prove a lot. (2) 15 of the 19 "wrong Do Its" are rows the labels call silent but that are label questions: seven save-to-Drive or OneDrive asks on a row with no attachment (the file chain is silent without one), six undated or «לפני החג» promises by the reader (C-18, C-3), two notes to self; 4 are real mistakes. (3) The trade is the point: a general model finds almost every close (missed 10%) and acts wrongly more often; Glance's rules and small model are precise and miss a lot (38%). The product design (Tier 2 model reading, then the device validator, strict gate and veto on every answer; `docs/glance-ai/ai-product.md`) is the way to take the recall without the wrong Do Its; its measured cost on the cached Qwen answers is in `ai-product.md` section 10. **No claim that Glance beats a frontier model follows from this, and none should be made.**

