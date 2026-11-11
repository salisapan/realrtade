# Sealed batches (plan 2, P1)

Glance closes open loops. Gmail is where it starts today.

A sealed batch is labelled (two blind Claude passes, `labeling/pass-rules.md`) and then **not opened**: no model is scored on it, no error is read, nothing is tuned on it, until a candidate is final. It is opened once, for that candidate, and the opening is logged below; a batch that has been opened is spent as decision data and becomes a hold-out.

- `batch-009` (93 rows, labelled 2026-11-11): sealed. `scoreboard/run.cjs` does not read this folder; `model/train/export-frozen.cjs` does not list it; to score it a person has to build its features on purpose.
- The files here are in the repository, so the seal is procedural, not technical: the rule is that nobody reads `batch-009.json` (it holds the reference and model answers) or scores against it before the candidate is final.

Opening log: none yet.
