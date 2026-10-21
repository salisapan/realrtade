# Glance model lab — state

Glance closes open loops. Glance's entry point is any surface the user is on.

## Product definition

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Glance's entry point is any surface the user is on. Flow, the enterprise product, is separate. This page is Glance only. Flow is a separate product.

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
- **Owner labels.** At least 200 owner-verified labels are required before a candidate can be promoted or before GPU fine-tuning starts. Today that count is 0. The reports above are not owner-verified. Batch-001 has CTO labels in `glance-ai/labeling/owner-gold.jsonl` (`labeledBy` `cto`, `ownerVerified` false on every row). Those are not the owner's answers. The chief of staff preview below is provisional / not owner-verified and is not part of this count. Labels that depend on who the person is (item 8 and the same group, Cc, addressed-to-other, and FYI shape) are context-dependent and are not part of that 200 (`docs/glance-ai/user-context-v0.md`).
- **GPU.** Parked 2026-10-08. Cap $30. Do not rent a machine and do not run `glance-ai/oss/finetune/gpu_run.sh run` until the labels exist and the owner approves the spend. `glance-ai/oss/finetune/GPU-RUNBOOK.md`. llama.cpp is not vendored. The 2026-10-08 UserContext lock adds three prerequisites before that training is useful: the UserContext v0 schema, a shadow event log, and contrast pairs (`docs/glance-ai/user-context-v0.md`). A GPU is still not the critical path.

## Owner-label path

Batch-001 is 19 synthetic cases (`v2syn-*` and two repo-test ids) under `glance-ai/labeling/`. The mail text is generated, not customer mail. `owner-gold.jsonl` is the single owner-gold file. It holds the CTO batch-001 labels (`labeledBy` `cto`). Owner-verified means `labeledBy` is `sali`. Any other name is stored and scored with `ownerVerified` false. The ingest refuses a file that asks for `ownerVerified: true` under another name. A ❓ mark stays out of the headline. So does `answerType: context-dependent`. Those rows are not binary labels and do not count toward the 200. Each one carries `depends_on`. The ingest refuses a context-dependent row that has no `depends_on`. A ✅ or 🤫 on that row is stored as excluded, not as gold, and it cannot set `ownerVerified`.

There is no blanket "Hi all" silence rule (Sali, 2026-10-08). Relevance comes from the per-user profile. The framework is `docs/glance-ai/user-context-v0.md`. Re-tagged, and out of the binary count:

| batch | item | id | depends_on |
|---|---|---|---|
| batch-001 | 8 | `v2syn-405` | `user_is_approver_for` |
| batch-001 | 12 | `v2syn-6931` | `cc_reply_rate` |
| batch-001 | 13 | `v2syn-7013` | `covers_addressee` |
| batch-001 | 14 | `v2syn-9674` | `role_matches_topic` |
| batch-001 | 15 | `v2syn-10482` | `work_style.files` |
| batch-002 | 2 | `v2syn-25810` | `work_style.files` |
| batch-002 | 3 | `v2syn-12865` | `user_is_approver_for` |

The map is `glance-ai/labeling/context-tags.cjs`. Owner-verified is still 0.

When the owner's answers file is in, this is the command:

```sh
node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json
```

It writes schema-valid rows, scores v2 alone, v2+veto, v2.1+veto, the engine on the tip, and gated Qwen propose-only where the existing cache covers the case, then rescores the shipped v2 held-out predictions. If `model/train/features-v2/train.jsonl` is on the machine it also refits v2 on CPU into `glance-ai/labeling/dry-run/`. That dry-run does not replace `model/artifacts/v2.gate.weights.json`.

The chief of staff proposed answers are `glance-ai/labeling/batch-001-cos-prefill.answers.json`. The owner has not confirmed them. Item 17 is still ❓. Its note says the close is a save to OneDrive, not a task and not silence. Items 8, 12, 13, 14, and 15 are context-dependent in that file, not binary marks. The preview command is the same script with `--preview`. The write-up `docs/glance-ai/owner-gold-preview-2026-10-08.md` is the score from before this re-tag. Every number in that file, and every number in the two tables below, is **provisional / not owner-verified**.

Scored provisional rows in that write-up: 17. That count included items 12–15 as silence and left out item 8 and item 17 as unsure. A fresh ingest of the same file now scores 13 binary rows. Context-dependent, left out of the 200: the seven ids in the table above. Unsure, still left out of the prefill: item 17 `v2syn-24392`. Owner-verified: 0.

The CTO answers (`glance-ai/labeling/batch-001-cto.answers.json`) were applied without `--preview` on 2026-10-08. Sali told the CTO to label without asking him. `labeledBy` is `cto`, so `ownerVerified` stays false. Consent is false. Items 8, 12, 13, 14, and 15 stay context-dependent and are not in the binary count. Item 17 is an ask, not silence and not a dated task: `actionLabel` `onedrive-file|file_save`, `expectedAction` `file_save`. Ingest accepted that action label because `expectedAction` is set. The canonical `ACTION_CLOSE` key for a file save is `drive-file|file_save`; this row keeps the override. Binary rows written: 14. Owner-verified among them: 0. The score is `glance-ai/labeling/dry-run/latest-report.json`. Shipped weights were not replaced. `model/train/features-v2/train.jsonl` was not on the machine, so the CPU refit did not run.

| system | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |
|---|---|---|---|---|---|---|---|---|
| v2 alone | 14 | 66.7% (2/3) | 9.1% (1/11) | 9.1% (1/11) | 50.0% (1/2) | 100.0% (1/1) | 14.3% (1/7) | 0.0% (0/4) |
| v2+veto | 14 | 66.7% (2/3) | 9.1% (1/11) | 9.1% (1/11) | 50.0% (1/2) | 100.0% (1/1) | 14.3% (1/7) | 0.0% (0/4) |
| v2.1+veto | 14 | 0.0% (0/3) | 45.5% (5/11) | 9.1% (1/11) | 0.0% (0/2) | 0.0% (0/1) | 42.9% (3/7) | 50.0% (2/4) |
| engine tip | 14 | 0.0% (0/3) | 81.8% (9/11) | 9.1% (1/11) | 0.0% (0/2) | 0.0% (0/1) | 100.0% (7/7) | 50.0% (2/4) |
| gated Qwen propose-only | 4 | 0.0% (0/2) | 50.0% (1/2) | 0.0% (0/2) | 0.0% (0/1) | 0.0% (0/1) | — (0/0) | 50.0% (1/2) |

Gated Qwen covers 4 of the 14 scored cases. Not covered: `v2syn-20323`, `v2syn-20284`, `v2syn-20987`, `v2syn-17987`, `v2syn-19085`, `v2syn-21422`, `v2syn-12147`, `v2syn-25034`, `v2syn-24392`, `v2syn-797`. Shipped v2+veto held-out wrong-Do-It moved from 1.4% (82/5727) to 1.3% (74/5718) when these 14 labels replace the machine reference on those ids. Weights were not shipped.

| system | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |
|---|---|---|---|---|---|---|---|---|
| v2 alone | 17 | 42.9% (3/7) | 0.0% (0/10) | 0.0% (0/10) | 33.3% (2/6) | 100.0% (1/1) | 0.0% (0/6) | 0.0% (0/4) |
| v2+veto | 17 | 28.6% (2/7) | 0.0% (0/10) | 0.0% (0/10) | 16.7% (1/6) | 100.0% (1/1) | 0.0% (0/6) | 0.0% (0/4) |
| v2.1+veto | 17 | 0.0% (0/7) | 40.0% (4/10) | 0.0% (0/10) | 0.0% (0/6) | 0.0% (0/1) | 33.3% (2/6) | 50.0% (2/4) |
| engine tip | 17 | 57.1% (4/7) | 80.0% (8/10) | 10.0% (1/10) | 66.7% (4/6) | 0.0% (0/1) | 100.0% (6/6) | 50.0% (2/4) |
| gated Qwen propose-only | 5 | 33.3% (1/3) | 50.0% (1/2) | 0.0% (0/2) | 50.0% (1/2) | 0.0% (0/1) | — (0/0) | 50.0% (1/2) |

Gated Qwen on this preview covers 5 of the 17 scored cases. Not covered: `v2syn-20323`, `v2syn-20284`, `v2syn-20987`, `v2syn-17987`, `v2syn-19085`, `v2syn-21422`, `v2syn-12147`, `v2syn-6931`, `v2syn-7013`, `v2syn-10482`, `v2syn-25034`, `v2syn-797`. The 33.3% (1/3) wrong-Do-It is on that tiny covered slice. It is not the strict-set table above, where gated Qwen wrong-Do-It stays 0.

Shipped v2 held-out, n=6982, with those 17 provisional labels overriding the machine reference (weights untouched):

| | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |
|---|---|---|---|---|---|---|---|---|
| v2+veto before | 6982 | 1.4% (82/5727) | 50.8% (637/1255) | 2.9% (37/1255) | 2.1% (62/3016) | 0.7% (20/2711) | 47.1% (227/482) | 53.0% (410/773) |
| v2+veto after | 6982 | 1.3% (74/5720) | 50.4% (636/1262) | 2.8% (35/1262) | 1.9% (56/3011) | 0.7% (18/2709) | 46.4% (226/487) | 52.9% (410/775) |
| v2 alone before | 6982 | 11.2% (642/5727) | 47.0% (590/1255) | 3.0% (38/1255) | 10.4% (315/3016) | 12.1% (327/2711) | 42.5% (205/482) | 49.8% (385/773) |
| v2 alone after | 6982 | 11.1% (634/5720) | 46.7% (589/1262) | 2.9% (36/1262) | 10.3% (309/3011) | 12.0% (325/2709) | 41.9% (204/487) | 49.7% (385/775) |

The CPU refit (`v2-owner-dryrun`, sklearn 1.9.1, tau 0.97) matched that after figure: strict wrong-Do-It 1.3% (74/5720). Train and val override hits were 0, test hits 17, so no training row changed. The before/after table is the effect of the new labels on the shipped decisions. The dry-run is not a candidate.

## Batch-002 and the gate audit, 2026-10-08

Owner-verified labels are still 0. Batch-002 is 20 synthetic cases ready for the owner, with an empty answers file. The gate audit below is on the chief of staff's provisional silences for batch-001 items 10, 11, 12, 13, 14, and 16. Every figure in this section is provisional / not owner-verified, or it is a machine-reference count on the shipped held-out. The write-up is `docs/glance-ai/batch-002-and-gate-audit-2026-10-08.md`.

Batch-002 mix, 20/20: Hebrew 12/20, English 8/20. Cached gated Qwen on 15/20. Silence-candidate tags 6/20 (money 2, FYI 1, group 1, small talk 1, injection 1). Show/silent splits 19/20. The sheet picked the FYI row as the nearest all-silent case to tau 0.97. Item 2 (that FYI) and item 3 (the group ask) are context-dependent as of the user-context lock. They are not binary labels. Drive save 1/20, OneDrive save 1/20. Draft, task, calendar, and file_save all appear.

No silence rule was adopted. On the v2 held-out (n=6982, strict, machine reference) the shipped v2+veto stays 1.4% (82/5727) wrong-Do-It and 50.8% (637/1255) missed close. A group-address silence was measured and rejected: missed close would rise by 6.614 points, to 57.4% (720/1255). The other four lab post-filters stay unwired. Gated Qwen strict wrong-Do-It stays 0 on every spec set. Suggest-save is untouched, so the prototype adds 0 chips. `bash glance-ai/run-cpu-checks.sh` on this change exited 0: owner-label tests passed, suggest-save new chips 0 (8191/8191 equal), gated Qwen pass bar true.

## User context v0 (lab)

Sali, 2026-10-08: every offer or silence uses the per-user profile. If the mail is relevant, Glance offers when there is an explicit intent span and the close is feasible. If it is not relevant, Glance stays silent. There is no blanket "Hi all" silence rule. No profile signal falls back to today's decision. Instinct onboarding (role and department) fills the profile on day one. The spec is `docs/glance-ai/user-context-v0.md`. Nothing here is wired into the extension.

Contrast set `glance-ai/labeling/contrast-v0.jsonl`: 40 synthetic pairs, 20 Hebrew and 20 English, `labeledBy` `synthetic-contrast`, owner-verified 0. Eight of the pairs are group asks, and each of those has an offer as the correct side for the approver. Pair accuracy is both sides right. The same answer on both sides fails the pair.

| | pair accuracy | wrong Do It | missed close | missed close on relevant |
|---|---|---|---|---|
| v2 without profile features | 0.0% (0/40) | 15.0% (6/40) | 85.0% (34/40) | 85.0% (34/40) |
| v2 plus profile features | 100.0% (40/40) | 0.0% (0/40) | 0.0% (0/40) | 0.0% (0/40) |

Empty profile on the shipped v2 held-out (`pred`, n=6982): 0 flips. Empty profile on the 40 contrast emails against live v2: 0 flips. Gated Qwen with a profile summary was not run. Qwen3.5-4B is not vendored, and 80 CPU prompts are not a cheap check. The report is `glance-ai/profile/out/contrast-report.json`.

The 100% pair accuracy above is in-sample. The hand rule was written until it matched `contrast-v0`. It is not a held-out result.

### contrast-heldout-v0 (frozen before the scorer)

`glance-ai/labeling/contrast-heldout-v0.jsonl` is 60 new pairs (30 Hebrew, 30 English), `labeledBy` `synthetic-heldout`, owner-verified 0. sha256 `8dcc096806b0f59c9062be9f07caacf3ffe1c6b5102598c34e92ff5c2170322c` (`contrast-heldout-v0.sha256`). The file is not a training input. It includes approver-plus-FYI, a group ask aimed at a named other person, a role match that appears only in the attachment name, a lookalike of a vendor the user pays, and a preference revoked by later dismissals.

| | pair accuracy | wrong Do It | missed close on relevant |
|---|---|---|---|
| Hand rule (`featurize` / `judge`) | 65.0% (39/60) | 16.7% (10/60) | 18.3% (11/60) |
| L2 logistic regression | 58.3% (35/60) | 11.7% (7/60) | 25.0% (15/60) |

The regression trains on `contrast-v0` plus `glance-ai/profile/generate-train.cjs` only. L2 is 0.01, chosen on a hash split of that training pool (validation relevance accuracy 0.975, which is not the held-out). Empty profile flips stay 0/6982 for both the hand rule and the learned scorer. Report: `glance-ai/profile/out/heldout-report.json`.

Largest relevant-class weights: `history_approved` +0.88, `saves_always` +0.82, `group_rate` −0.64, `pref_offer` +0.57, `history_against` −0.57. `approver_on_thread` is about +0.03, so the linear model does not carry the approver bit. `group_rate` uses −1 for missing, and that sentinel is why the sign is not a clean "answers the group" effect.

What the extension event log has to capture first, for Dima (open-tasks row 62):

1. `approved` with `fetchedBack`, plus `partyKey`, `intentFamily`, and `at`.
2. `dismissed` and `undo` on that same key, with `at`, so a later dismissal can outweigh an older preference.
3. A real reply count next to `shown`, so a group reply rate is a count. Missing must stay missing, not a filled-in zero.
4. `partyKey` is the exact address. A lookalike domain is a different party.

`savesFiles` and role or department are onboarding fields, not mail events. They outweigh most of the mail features. Attachment-name topic (`role_topic_file` +0.25) is weaker than the body topic. The learned scorer does not replace the hand rule: it lowers wrong Do It and raises missed close on relevant mail.

## Next stages

1. Keep v2 as the default shadow candidate. Keep v2.1 in shadow. Do not promote either on these reports alone.
2. Log the real attachment list (size, inline, contentId, kind) so suggest-save can be scored on real files instead of the unread gate.
3. The owner answers batch-001 and batch-002. Both sheets are in git. Answers are still empty on batch-002, and batch-001 is still the chief of staff's unconfirmed proposal. Collect at least 200 owner-verified labels. Until then missed-close and wrong-Do-It stay machine-reference numbers. Owner-verified today: 0.
4. Unpark GPU only after those labels and an owner spend approval. The SFT train split is regenerated from the generators; it is not in git. The val split is `glance-ai/eval-data/sft-v2-val.jsonl`.
5. CPU regression for this tree is `bash glance-ai/run-cpu-checks.sh`. It now starts with the owner-label ingest and score tests. A silence-only change must leave wrong-Do-It at 0 on the gated table and must not add a chip on `eval-data/suggest-save-v22.jsonl`.

## CPU re-run

Filled in by the commit that added this tree. See the pull request for the command log. The checks that ran here:

- Suggest-save corpus 22/22, edge cases 37/37, JS/Python parity on both. Dataset check 8191/8191, new chips 0. Of those rows, 167 show-to-quiet updates are the Outlook bare Drive / דרייב silence, 105 are quiet-reason changes, and 1921 are single-file chip strings aligned to the file name the 22-row corpus already requires.
- Hebrew currency veto: titles with ₪, ש"ח, ש״ח, ש''ח, שקל, and שקלים are `money`. שקלונות, שלום, "5 files", and "hard drive" are not.
- `dataset/out-v2/all.jsonl` regenerated from the generators and matched the uploaded file byte for byte. sha256 `d4aab097339b6cafde9708082ab87803e7de7527d40e51a64b4cb8169b536e48` (recorded in `glance-ai/model/dataset/v2/all.jsonl.sha256`). Harvest uses the 0.9.34 test corpora (`8f8edaee0137a5c0bf50e61e5f1bdcab33029f18`); labels use engine 0.9.35 (`db563fd984e848d1edfaf40f3cda1d2261784a81`). Both trees are `git archive`d into temp dirs. The jsonl stays gitignored. Test corpora are read in filename order.
- Stripper on that file, engine 0.9.35: raw flips 767, removed 767, left 0, new flips 0, clean-render changes 0. Stress hashes matched between JS and Python. The current tip on the same rows: raw flips 422, full stripper left 0, new flips 0.
- Norm-flip (`shadow/norm-flips-v21.cjs`), 25,848 non-typo synthetic rows. Engine 0.9.35: raw 767, minimal 482 left (288 removed, 3 new), clean 482 left (288 removed, 3 new), full stripper 0 left (767 removed, 0 new). Tip: raw 422, minimal 159 left (266 removed, 3 new), clean the same as minimal, full stripper 0 left (422 removed, 0 new).
- Shadow package on `eval-data/v2-heldout-test.jsonl` (6,982 rows): feature parity 6,982/6,982 for v2 and v2.1, JS dense parity 6,982/6,982 for both, logging 16/16, size 734,810 bytes (budget 871,000). Python decision parity against the checked-in sklearn preds: v2 6,977/6,982 (0.99928), v2.1 6,976/6,982 (0.99914).
- Gated Qwen re-score: pass bar true, wrong-Do-It 0 on every strict spec set (table above).
- Re-run on this commit: `bash glance-ai/run-cpu-checks.sh` exited 0. Owner-label ingest and score tests passed. Suggest-save new chips 0. Gated Qwen wrong-Do-It stayed 0 on every strict spec set. The shadow package creates its gitignored `test/out` and `bench/out` directories before it writes, so a fresh tree can run the check.
