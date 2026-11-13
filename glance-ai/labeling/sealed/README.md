# Sealed batches (plan 2, P1)

Glance closes open loops. Gmail is where it starts today.

A sealed batch is labelled (two blind Claude passes, `labeling/pass-rules.md`) and then **not opened**: no model is scored on it, no error is read, nothing is tuned on it, until a candidate is final. It is opened once, for that candidate, and the opening is logged below; a batch that has been opened is spent as decision data and becomes a hold-out.

- `batch-009` (93 rows, labelled 2026-11-11): sealed. `scoreboard/run.cjs` does not read this folder; `model/train/export-frozen.cjs` does not list it; to score it a person has to build its features on purpose.
- The files here are in the repository, so the seal is procedural, not technical: the rule is that nobody reads `batch-009.json` (it holds the reference and model answers) or scores against it before the candidate is final.

Opening log:

- 2026-11-11, the model-lab session (teacher environment), opened batch-009 ONCE, for the frontier-reader baseline (runbook step 1): `claude-opus-5-5` read the 93 masked cases (`frontier-opus.labels.jsonl`, $0.34 of the lab credit incl. a first run lost to hidden-reasoning truncation and repeated), and v2 and v2.9 were scored on the same rows with `scoreboard/run.cjs --frozen labeling/sealed/frozen-sealed.jsonl --hard-quiets A` (`opening-2026-11-11.md`). Result (agreement labels, n = 77, Claude's labels, NOT owner-verified): engine+v2 missed 31.6% (12/38), engine+v2.9 23.7% (9/38), frontier reader 2.6% (1/38) with 3/39 wrong Do Its against 2/39. The batch is now spent: a hold-out, not used for any later candidate.
