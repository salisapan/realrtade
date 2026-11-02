# Batch-007: 100 labels, two blind passes, the pre-registered reference fix, and why v2.6 is still held

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing is wired into the extension, and v2 stays the default model. The labels are Claude's (`claude`, `claude-pass2`), never owner-verified: owner-verified labels are still 0 of 200, and no own-use file (path A) has been handed over.

This is the model trainer run of 2026-11-02. There was no run on Thursday 10-29: no scheduled message for it reached this session.

PR #243 (this routine's work from 10-12 to 10-26) is still open and unmerged. This run's branch carries it.

## The pre-registered step: the attach-to-invite reference

BATCH-006 pre-registered a fix before any model was trained on it: the v2 reference for "Please attach X to the <meeting> on <day> at <time>" / «בבקשה לצרף את X לזימון של ה<פגישה> <יום> <שעה>» is silent, and the blind passes labelled it a draft.

**How it was applied, and where that differs from the plan.** It is applied as a label layer, `model/train/ref-fix.cjs`, not in the dataset overrides. `runtime/product-rules.cjs` is shared with the lab runtime, and the pinned dataset feeds frozen numbers in several lab tests. A layer on top of the features changes the training and scoring labels without moving the pinned sha256, which still matches.
- Only rows the engine was simply silent on change; a row a product rule silenced stays silent.
- 16 training rows and 22 test rows change.
- v2, v2.3 and v2.6 were retrained on the fixed labels (`v2f/`), and every model is scored against the fixed truth (`TRUTH=features-v23f`).

**Batch-007 weakens the fix's basis.** Pass 2 labelled item 34, an attach-to-invite mail, as calendar; pass 1 said draft. The pattern now has two blind agreements on draft (batch-004 #35, batch-006 #35) and two disagreements (batch-005 #35 and batch-007 #34, both draft against calendar). Nobody labelled it silent. The fix stays a lab layer, and the owner's view would settle it.

## The batch

`make-batch.cjs --batch 7 --size 100 --seed 7`, with the same pools. It leans toward request_reply, repo, repo-test, commitment_reader, file_place, hedge, third_party, task_ask, create_doc, payment and meeting.

**Pass 1** (written before the record was opened):

| label | count |
|---|---|
| silent | 52 (12 of them undated asks) |
| draft | 15 |
| task | 11 |
| calendar | 6 |
| file_save | 3 |
| CONTEXT | 11 |
| UNSURE | 2 |

**Pass 2** came from a fresh agent with the same prompt as batch-006. It reported 1 tool call.
- 85 of 87 agree (97.7%).
- Two disagreements: item 31, the sender says they will join a meeting (calendar or silent); item 34, attach-to-invite (draft or calendar).

**Agreement labels: 529.** NOT owner-verified.

## Numbers (pinned dataset; product order = this repo's engine + veto, then the model)

Wrong Do It / missed:

| label set | engine + veto | then v2 | then v2.3 (best) | then v2.6 | then v2.6 trained on the fixed labels |
|---|---|---|---|---|---|
| v2 test split, fixed truth (4,913 silent, 1,277 act) | | 7 / 51 | 10 / 48 | 10 / 46 | 11 / 46 |
| v2 test split, blind spots caught / 367 | | 47 | 138 | 130 | 130 |
| batch-003 (101, 86) | 19 / 39 | 21 / 35 | 21 / 29 | 21 / 27 | 21 / 25 |
| batch-004 (53, 40) | 6 / 23 | 6 / 21 | 6 / 18 | 6 / 16 | 6 / 16 |
| batch-005 (55, 36) | 4 / 19 | 5 / 17 | 6 / 14 | 4 / 14 | 4 / 14 |
| batch-006 (56, 34) | 5 / 16 | 6 / 16 | 7 / 14 | 6 / 14 | 6 / 13 |
| **batch-007, hold-out (52, 35)** | 7 / 19 | 7 / 16 | 7 / 14 (HE 6/20, EN 8/15) | 7 / 15 (HE 7/20, EN 8/15) | 7 / 15 |
| agreement-gold (316, 213) | 40 / 113 | 44 / 102 | 46 / 86 | **43 / 83** | 43 / 80 |

The gate on 529 agreement labels:

| base → candidate | product order | alone |
|---|---|---|
| v2.3 → v2.6 | **PROMOTE** (43 vs 46 wrong Do Its, 83 vs 86 missed) | PROMOTE (3 vs 7 wrong Do Its) |
| v2.3f → v2.6f | PROMOTE (43 vs 45 wrong Do Its, 80 vs 86 missed) | PROMOTE |
| v2 → v2.6 | HOLD (12 vs 9 wrong actions) | HOLD |

## Why v2.6 is still held

With the fixed truth, v2.6 has no more wrong Do Its than v2.3 on any label set: 10 against 10 on the test split, fewer or equal everywhere else. The routine's other half is "misses fewer in total". Counted as in the 10-19 run (test-split reference rows + engine blind spots + every batch), v2.6 misses **369 against 366**. The retrained v2.6f ties at 366, and it also has 11 wrong Do Its on the test split.

The 8 extra misses are real: v2.6 loses 12 blind spots that v2.3 catches, and wins 4. All 12 are dated asks, 11 of them in Hebrew. For example:
- «תשלח בבקשה את נספח ב׳ כקובץ מצורף עד יום רביעי»
- «אפשר follow up על התקציב עד ה-15 באוקטובר?»

Likely cause: the "asap" negatives are mostly the same Hebrew reply-with-file templates with «בהקדם», so the model learned the template instead of the missing date.

**v2.3 stays the best so far.** The gate prefers v2.6 for the third run in a row, on agreement labels from the same model family; the routine's rule, which also counts the engine's blind spots, does not. No weights were exported.

**Next run's concrete change:** keep the asap negatives, and pair each with the same template carrying a date as a positive (contrast pairs), so the date is what the model learns.

## What the labels found wrong (engine findings for the red team; `core/` is not edited from this routine)

Today's engine plus veto on batch-007.

**Undated asks get a reply draft or a task.** This continues batch-006. No owner decision allows it; the device rule is silent with `ask-without-date`.
- 38: «תוכל להסתכל על הטיוטה ולומר לי מה לא נראה לך?»
- 39: «תכין מסמך קצר ותשלח אותו לדנה.»
- 42: "you said you'd get back to me … asap", given a task
- 49: "Could you tell me which address the invoice should go to?"
- 50: "Please draft a reply with the amount from the budget sheet."

**Other wrong Do Its**

| item | mail | what the engine did | repeats |
|---|---|---|---|
| 44 | "Please store the attached file in Drive" on an **Outlook** mailbox | Drive save | fourth batch in a row |
| 65 | the hedge «אם יהיה לך זמן מתישהו, אולי נדבר» | a draft | |

**Wrong actions**

| item | mail | engine offers | label |
|---|---|---|---|
| 1 | «לפי מה שאמרת, תחזור אליי עם תשובה עד יום שני» | a reply | task (both passes) |
| 34 | attach-to-invite | a task | draft or calendar (passes disagree) |

## Reproduce (CPU)

As BATCH-005.md and BATCH-006.md, plus:

```sh
cd model && node train/ref-fix.cjs features-v2 features-v23 features-v26     # writes features-*f/
.venv/bin/python train/train-v2.py --feat features-v2f --tag basef --out v2f/base --no-export   # full pinned env
.venv/bin/python train/train-v2.py --feat features-v23f --tag v23f --out v2f/v23
.venv/bin/python train/train-v2.py --feat features-v26f --tag v26f --out v2f/v26
TRUTH=features-v23f .venv/bin/python train/compare-v2n.py v23=v23/export/v23.test-preds.jsonl v26=v26/v26.test-preds.jsonl ...
```
