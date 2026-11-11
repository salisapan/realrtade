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

## First reading (2026-11-11)

On the 444 agreement labels (230 reach the v2 test split), in the product order the **engine alone** makes 26 wrong Do Its out of 161 silent rows (16.1%, interval 11.3% to 22.6%). v2.6 adds none and cuts missed closes from 35 to 26 of 69. So the wrong-Do-It rate is the engine's, not the model's: 13 of the 26 are undated asks (convention C-4, the owner's open decision) and 13 are engine reads of real sentences, for example a confirmed amount read as a task («העסקה אושרה בבלוק 18221», convention C-1). The model alone has 1 wrong Do It in 161.
