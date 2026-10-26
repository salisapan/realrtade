# Batch-006: 100 labels, two blind passes; v2.6 passes the gate, held by one test-split row

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing is wired into the extension, and v2 stays the default model. The labels are Claude's (`claude`, `claude-pass2`), never owner-verified: owner-verified labels are still 0 of 200, and no own-use file (path A) has been handed over.

This is the model trainer run of 2026-10-26. The run of Thursday 2026-10-22 did not happen: its scheduled message reached this session on 10-26 together with this one, so this is one run.

## Before the run

- **PR #134 and PR #176 were closed unmerged** in the CTO cleanup of 2026-10-25 ("stale/superseded; reopen if needed"). So none of the trainer work since 2026-10-12 was on the working branch. This run's branch carries all of it:
  - batch-004 and batch-005;
  - the frozen clock and the host context in `model/teacher/`;
  - step-level `compare-v2n.py`;
  - the agreement labels.
- **The owner said, on 2026-10-20: «עשה הכל לבד. יש לך אישורים להכל».** This run merges its PR into the working branch on that approval (see the PR). It does not change the gate's rules, mark anything owner-verified, wire a model or replace the default: those would be false on the facts, not only unapproved.
- **Two lab checks fixed** (committed 2026-10-20). Both had failed on the clean working branch too.
  - `labeling/test-silence-prototype.cjs` now expects the engine's own Cc-only and addressed-to-other quiet. The teacher passes the recipients since 2026-10-19.
  - `model/shadow-pkg/test/core-loader.cjs` loads the same engine and frozen clock as the v2 pipeline. Feature parity is 6,982 of 6,982 (was 6,758).
- **One lab check left failing:** `profile/test-heldout.cjs`.
  - It passes with the pinned environment and fails on today's engine since #165, which changes 11/60 to 12/60.
  - `run-cpu-checks.sh` runs it before it exports that environment. The fix belongs in `run-cpu-checks.sh`, which open PR #128 also changes, so this run does not edit it.
- **The rebuilt dataset matches** `dataset/v2/all.jsonl.sha256`. The features are identical to the 10-19 training (train, val and test: 0 rows differ), so the 10-19 models are valid baselines.

## The batch

`make-batch.cjs --batch 6 --size 100 --seed 6`, with the same pools as batch-005. It leans toward payment, meeting, own_commitment_self, request_reply, commitment_reader, drive_save, onedrive_save, third_party, repo, calendar_hold and file_place.

**Pass 1** (Claude, blind, written before the record was opened):

| label | count |
|---|---|
| silent | 56 (12 of them undated asks) |
| draft | 12 |
| task | 11 |
| calendar | 7 |
| file_save | 4 |
| CONTEXT | 7 |
| UNSURE | 3 |

The three UNSURE are notes to self with a clock time.

**Pass 2** came from a fresh agent with only the cases and the rules. It reported 1 tool call. The two passes agree on all 90 cases both decided; the only differences are where pass 1 said UNSURE or CONTEXT.

The agreement is rising: 93%, then 97.8%, then 100%. One reason is that the pass-2 prompt now states in words conventions the batches settled. That makes the two passes less independent, and a blind spot they share passes unseen.

**Agreement labels: 444** (174 + 91 + 89 + 90). They are NOT owner-verified.

## Numbers (pinned dataset; product order = this repo's engine + veto, then the model)

Wrong Do It / missed:

| label set | engine + veto | then v2 | then v2.3 (best) | then v2.5b | then **v2.6** |
|---|---|---|---|---|---|
| v2 test split (4,935 silent, 1,255 act) | | 9 / 31 | 10 / 26 | 12 / 27 | 11 / 25 |
| v2 test split, blind spots caught / 367 | | 47 | 138 | 134 | 130 |
| batch-003 (101, 86) | 19 / 40 | 21 / 36 | 21 / 30 | 21 / 28 | 21 / 28 |
| batch-004 (53, 40) | 5 / 23 | 5 / 21 | 5 / 18 | 6 / 16 | 5 / 16 |
| batch-005 (55, 36) | 4 / 19 | 5 / 17 | 6 / 14 | 5 / 13 | 4 / 14 |
| **batch-006, hold-out (56, 34)** | 5 / 16 | 6 / 16 | 7 / 14 (HE 7/19, EN 7/15) | 10 / 14 | **6 / 14 (HE 7/19, EN 7/15)** |
| agreement-gold (264, 180) | 32 / 94 | 36 / 86 | 38 / 72 | 41 / 68 | **35 / 68** |

Today's engine moved a lot since 10-19 (202 commits on the working branch). On batch-003 it misses fewer (52 → 40) but makes more wrong Do Its (16 → 19).

## v2.6, and why it is held this run

**v2.6** (`train/gap-labels-v25.cjs`, `GLANCE_V25=c`) is v2.5b plus one change. An undated ask that only says asap, as soon as possible, «בהקדם» or «מיד» is labelled silent, as the device does today. That is v2.5b's leak, found in BATCH-005. It adds 126 such rows to training.

- **The gate on 444 agreement labels says PROMOTE over v2.3**, in the product order and alone:
  - product order: 35 against 38 wrong Do Its, 68 against 72 missed, the same 10 wrong actions;
  - alone: 3 against 7 wrong Do Its.
- **The routine's rule fails on one row.** v2.6 has 11 wrong Do Its on the v2 test split against v2.3's 10.
  - The one extra row: «בבקשה לצרף את נספח ב׳ לזימון של הזום ב-19 באוקטובר בשעה 11:15», where v2.6 offers a calendar event.
  - The v2 reference calls it silent. Both blind passes labelled this pattern a draft (batch-004 item 35, batch-006 item 35), so the reference is wrong there. But v2.6's calendar is also not the right step.

**v2.3 stays the best so far.** Moving v2.6 now would mean changing the test label right after it blocked the candidate: a post-hoc fit. Instead it is **pre-registered for the next run**:
1. Fix the v2 reference for "attach X to the invite on <day> <time>" (`file_place`) to a draft, in the lab overrides.
2. Update the pinned sha256 in the same commit.
3. Retrain v2, v2.3 and v2.6.
4. Decide by the same rule.

No weights were exported. Against the default v2, the gate holds both v2.3 and v2.6, so v2 stays the default either way:
- v2.3 has more wrong Do Its (38 against 36);
- v2.6 has more wrong actions (10 against 7).

## What the labels found wrong (engine findings for the red team; `core/` is not edited from this routine)

Today's engine plus veto on batch-006:

**Undated asks now get a reply draft.** No owner decision allows this; the device rule is `ask-without-date`, silent.
- 39: «נא להעביר אליי את הסריקה של הדרכון.»
- 84: "Please make a spreadsheet tracking the migration."
- 92: «תעדכן אותי מה קורה עם האישור»

This is new since 10-19, most likely from the recent "polite asks offer the reply card" engine runs.

**Other wrong Do Its**

| item | mail | what the engine did | repeats |
|---|---|---|---|
| 57 | a hedge addressed by name to someone else: «ליאור, אם יהיה לך זמן מתישהו, אולי נדבר» | a draft | |
| 50 | the sender's own promise: "We will email the vaccination records tomorrow" | a task for the person | third batch in a row |

**Wrong actions**

| item | mail | engine offers | label |
|---|---|---|---|
| 32 | «התחייבת להעביר את ה-SOW עד יום שני, נכון?» | a reply | task (batch-005 item 32 again) |
| 35 | attach the SOW to the demo invite | a task | draft |

## Reproduce (CPU)

As BATCH-005.md, plus:

```sh
cd model && GLANCE_V25=c GLANCE_NOW=2026-10-07T12:00:00+03:00 node train/gap-labels-v25.cjs
.venv/bin/python train/train-v2.py --feat features-v26 --tag v26 --out v26      # in the full pinned env
```
