# Glance model lab — state

Glance closes open loops. Gmail is where it starts today.

## Product definition

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Gmail is the current primary entry surface. Flow, the enterprise product, is separate. This page is Glance only. Flow is a separate product.

## Implementation status

The lab is `glance-ai/` in this repository. It is offline. It is not wired into the extension in this commit, and nothing here surfaces a Do It. Glance never sends. The engine-under-test loads `core/*.js` from `flow-trial-extension` (the in-repo tip). How to point it at another unpacked tree: `glance-ai/README.md`.

Numbers in the historical reports were measured on engine 0.9.35. They are not re-measured by running the CPU checks on the tip.

## Model candidates

| candidate | role | weights |
|---|---|---|
| v2 | default shadow candidate | `glance-ai/model/shadow-pkg/weights/v2.p0.glw` and `glance-ai/model/artifacts/v2.gate.weights.json` |
| v2.1 | second candidate, shadow only | `glance-ai/model/shadow-pkg/weights/v21.p0.glw` and `glance-ai/model/artifacts/v21.gate.weights.json` |

v2 stays the default. v2.1 is not promoted. Promotion would need owner-verified labels and a wrong-Do-It that does not rise. Silence beats a wrong Do It.

## Headline metrics

Source files are the training-machine reports. Masked rows exclude engine-recall-gap rows marked unsure. The reference is product-correct labels (engine 0.9.35 on the clean render, plus rule overrides), not owner-verified labels.

From `glance-ai/model/shadow/out-v2/report.md` (built 2026-10-07, held-out test, masked):

| system | wrong-Do-It | missed close | Hebrew missed | English missed | wrong action | STRICT wrong-Do-It |
|---|---|---|---|---|---|---|
| v2 model alone | 11.31% (558) | 46.93% | 42.53% | 49.68% | 37 | 11.24% |
| v2 + veto | 0.06% (3) | 50.68% | 47.1% | 52.91% | 36 | 1.43% |

From `glance-ai/model/shadow/out-v21/report.md` (same rows, masked):

| system | wrong-Do-It | missed close | Hebrew missed | English missed | wrong action | STRICT wrong-Do-It |
|---|---|---|---|---|---|---|
| v2.1 model alone | 11.19% (552) | 51% | 47.3% | 53.3% | 26 | 11.07% |
| v2.1 + veto | 0.02% (1) | 54.82% | 52.07% | 56.53% | 26 | 1.29% |

The operating threshold used by the shadow package is the `tau` stored in the packed weights (0.97 on the v2 gate in the parity diffs recorded with those weights). The sweep that chose it is `glance-ai/model/artifacts/v2.report.json` (`oofSweep`, tau 0.97).

## Gated Qwen propose-only

Qwen3.5-4B is the OSS winner. The table is propose-only, strict gate, spec labels. No LLM is run for this score: predictions are the cache `glance-ai/oss/shadow-combined/llm-qwen3.5-4b.jsonl`. The scorer is `glance-ai/oss/shadow-combined/gated/score-gated.cjs`. The full table is `glance-ai/oss/shadow-combined/gated/tables.md`.

The case file `glance-ai/eval-data/shadow-combined-cases.jsonl` has 796 lines (OSS 275, v2 held-out sample 400, adversarial 74, injection hand set 47). Scoring drops AMBIGUOUS and ANY, so the pooled scored n is 786. Cached predictions cover the 431 rows marked `needLLM` (431/431).

Strict gate, spec labels, wrong-Do-It is 0 on every set:

| set | n | missed | wrong-Do-It |
|---|---|---|---|
| CORE162 | 162 | 13.5% (7/52) | 0.0% (0/110) |
| OSS 275 | 275 | 12.0% (13/108) | 0.0% (0/167) |
| v2 held-out 400 | 400 | 11.0% (20/182) | 0.0% (0/218) |
| adversarial | 72 scored | 9.1% (2/22) | 0.0% (0/50) |
| injection hand set | 39 scored | 20.0% (2/10) | 0.0% (0/29) |
| ALL pooled | 786 | 11.5% (37/322) | 0.0% (0/464) |

The same file's no-gate propose-only row on the v2 held-out is 3.7% (8/218) wrong-Do-It on spec labels and 4.5% (10/220) on v2 labels. The gate is what brings that to zero.

The strict gate treats a save proposal as unread (`suggest:attachments-unread`) because the case file has counts and names only. The SENSITIVITY row models declared files as 240KB PDFs. That row is not a result.

## Blocked

- **Real attachment list.** `shadow-combined-cases.jsonl` has a count, and OSS rows have names. It does not have size, inline, contentId, or kind. Until the shadow log carries the real list, every LLM save proposal stays silent under the strict gate. `tables.md` records 164 of 796 cases declaring attachments and 0 carrying the real list.
- **Owner labels.** At least 200 owner-verified labels are required before a candidate can be promoted or before GPU fine-tuning starts. Today that count is 0. The reports above are not owner-verified.
- **GPU.** Parked 2026-10-08. Cap $30. Do not rent a machine and do not run `glance-ai/oss/finetune/gpu_run.sh run` until the labels exist and the owner approves the spend. `glance-ai/oss/finetune/GPU-RUNBOOK.md`. llama.cpp is not vendored.

## Next stages

1. Keep v2 as the default shadow candidate. Keep v2.1 in shadow. Do not promote either on these reports alone.
2. Log the real attachment list (size, inline, contentId, kind) so suggest-save can be scored on real files instead of the unread gate.
3. Collect at least 200 owner-verified labels. Until then missed-close and wrong-Do-It stay machine-reference numbers.
4. Unpark GPU only after those labels and an owner spend approval. The SFT train split is regenerated from the generators; it is not in git. The val split is `glance-ai/eval-data/sft-v2-val.jsonl`.
5. CPU regression for this tree is `bash glance-ai/run-cpu-checks.sh`. A silence-only change must leave wrong-Do-It at 0 on the gated table and must not add a chip on `eval-data/suggest-save-v22.jsonl`.

## CPU re-run

Filled in by the commit that added this tree. See the pull request for the command log. The checks that ran here:

- Suggest-save corpus 22/22, edge cases 37/37, JS/Python parity on both. Dataset check 8191/8191, new chips 0. Of those rows, 167 show-to-quiet updates are the Outlook bare Drive / דרייב silence, 105 are quiet-reason changes, and 1921 are single-file chip strings aligned to the file name the 22-row corpus already requires.
- Hebrew currency veto: titles with ₪, ש"ח, ש״ח, ש''ח, שקל, and שקלים are `money`. שקלונות, שלום, "5 files", and "hard drive" are not.
- `dataset/out-v2/all.jsonl` regenerated from the generators and matched the uploaded file byte for byte. sha256 `d4aab097339b6cafde9708082ab87803e7de7527d40e51a64b4cb8169b536e48` (recorded in `glance-ai/model/dataset/v2/all.jsonl.sha256`). Harvest uses the 0.9.34 test corpora (`8f8edaee0137a5c0bf50e61e5f1bdcab33029f18`); labels use engine 0.9.35 (`db563fd984e848d1edfaf40f3cda1d2261784a81`). Both trees are `git archive`d into temp dirs. The jsonl stays gitignored. Test corpora are read in filename order.
- Stripper on that file, engine 0.9.35: raw flips 767, removed 767, left 0, new flips 0, clean-render changes 0. Stress hashes matched between JS and Python. The current tip on the same rows: raw flips 422, full stripper left 0, new flips 0.
- Norm-flip (`shadow/norm-flips-v21.cjs`), 25,848 non-typo synthetic rows. Engine 0.9.35: raw 767, minimal 482 left (288 removed, 3 new), clean 482 left (288 removed, 3 new), full stripper 0 left (767 removed, 0 new). Tip: raw 422, minimal 159 left (266 removed, 3 new), clean the same as minimal, full stripper 0 left (422 removed, 0 new).
- Shadow package on `eval-data/v2-heldout-test.jsonl` (6,982 rows): feature parity 6,982/6,982 for v2 and v2.1, JS dense parity 6,982/6,982 for both, logging 16/16, size 734,810 bytes (budget 871,000). Python decision parity against the checked-in sklearn preds: v2 6,977/6,982 (0.99928), v2.1 6,976/6,982 (0.99914).
- Gated Qwen re-score: pass bar true, wrong-Do-It 0 on every strict spec set (table above).
