# Frozen real-mail test set (structure only; Phase 0)

Glance closes open loops. Gmail is where it starts today.

Purpose: the one test set that is never trained on, so a number on it means something about real mail. Two parts:

- `public/`: masked, owner-approved sentences checked into git (today the 22 in `flow-trial-extension/test/fixtures/real-mail-gold.json`).
- `private/`: everything else. **Gitignored. Never committed, never pasted into a chat, never used to train.** Masked before it is stored.

Row format (`*.jsonl`): `{ id, lang, direction, redactedBody, ownerLabel, step, ownerVerified, labeledBy, source, convention }`.
`step` is one of `SILENT | task | calendar | draft | file_save`; `ownerVerified` is true only for a label the owner made himself or from his own use with read-back proof (path A); `convention` cites an id of `docs/glance-ai/model-conventions.md`.

Rules (`docs/human-eval.md` §6): a row here is never a training row; every fix made after looking at a row is declared in the run record; the owner-verified count is reported with every number. Nothing enters `private/` without the owner's say and masking first.

Status: structure only. 0 owner-verified rows; waits on path A (`docs/glance-ai/learning-from-use.md`).
