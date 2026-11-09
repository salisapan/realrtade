# Batch-008: 95 labels, two blind passes, v2.7 (asap contrast pairs) held; the gate and the routine's rule keep disagreeing

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing is wired into the extension, and v2 stays the default model. The labels are Claude's (`claude`, `claude-pass2`), never owner-verified: owner-verified labels are still 0 of 200, and no own-use file (path A) has been handed over.

This is the model trainer run of 2026-11-09. There was no run on Thursday 11-05: no scheduled message for it reached this session.

PR #256 (all trainer work since 10-12) was still an open draft; this run's branch carries it. The rebuilt dataset still matches the pinned sha256.

## The batch

`make-batch.cjs --batch 8 --size 100 --seed 8` produced **95 cases**: the English blind-spot pool ran out at 10. It leans toward reply_with_file, request_reply, hedge, drive_save, onedrive_save, commitment_reader, file_place, meeting, task_ask, third_party and repo.

**Pass 1** (written before the record was opened):

| label | count |
|---|---|
| silent | 51 (10 of them undated asks) |
| task | 12 |
| draft | 11 |
| calendar | 8 |
| file_save | 3 |
| CONTEXT | 9 |
| UNSURE | 1 |

**Pass 2** came from a fresh agent with the same prompt as batch-006 and batch-007. It reported 1 tool call. It agrees on all 85 cases both decided. As in BATCH-006, that agreement comes partly from the conventions the prompt now states.

**Agreement labels: 614.** NOT owner-verified.

## This run's change: v2.7

Pre-registered in BATCH-007: the asap negatives become contrast pairs. Per template, there are no more asap-silent rows than dated positives (`GLANCE_V25=d`, then `train/ref-fix.cjs`).

Only 24 of the 126 negatives had no dated partner, so the change is small. That is itself a finding: the template silence v2.6 learned is not caused by unpaired negatives.

## Numbers (pinned dataset; product order = this repo's engine + veto, then the model; v2 test split against the fixed truth `features-v23f`)

Wrong Do It / missed:

| label set | engine + veto | then v2 | then v2.3 (best) | then v2.6 | then v2.7 |
|---|---|---|---|---|---|
| v2 test split (4,913, 1,277) | | 9 / 31* | 10 / 48 | 10 / 46 | **9 / 43** |
| v2 test split, blind spots caught / 367 | | 47 | 138 | 130 | 130 (EN 10/52) |
| batch-003 (101, 86) | 17 / 38 | 19 / 34 | 19 / 28 | 19 / 26 | **20** / 27 |
| batch-004 (53, 40) | 6 / 22 | 6 / 21 | 6 / 18 | 6 / 16 | 6 / 16 |
| batch-005 (55, 36) | 4 / 19 | 5 / 17 | 6 / 14 | 4 / 14 | 5 / 14 |
| batch-006 (56, 34) | 4 / 16 | 5 / 16 | 6 / 14 | 5 / 14 | 5 / 14 |
| batch-007 (52, 35) | 6 / 18 | 6 / 15 | 6 / 14 | 6 / 15 | 6 / 15 |
| **batch-008, hold-out (51, 34)** | 8 / 19 | 8 / 18 | 8 / 14 (HE 9/19, EN 5/15) | 8 / 14 | 8 / 14 (HE 8/19, EN 6/15) |
| agreement-gold (367, 247) | 44 / 129 | 48 / 118 | 50 / 99 | **47 / 96** | 49 / 97 |

\* v2 row on the original truth (`features-v23`). On the fixed truth, v2 retrained on it scores 7 / 53.

The engine moved again since 11-02: on batch-003 it now makes 17 wrong Do Its and 38 misses, against 19 and 40.

The gate on 614 agreement labels:

| base → candidate | product order | alone |
|---|---|---|
| v2.3 → v2.6 | **PROMOTE** (47 vs 50 wrong Do Its, 96 vs 99 missed) | PROMOTE (4 vs 7 wrong Do Its) |
| v2.3 → v2.7 | PROMOTE (49 vs 50, 97 vs 99) | HOLD (Hebrew wrong Do Its 3 → 5) |
| v2 → v2.7 | HOLD (more wrong Do Its and wrong actions) | HOLD |

**The routine's rule holds both candidates. v2.3 stays the best so far.**
- **v2.7:** one more wrong Do It than v2.3 on batch-003 (20 against 19).
- **v2.6:** no more wrong Do Its than v2.3 on any set, but 3 more misses in total (382 against 379). Every one of those is among the engine's blind spots on the test split (130 against 138 caught), whose labels are template intent (`gap-labels-v23.cjs`), not blind labels. On every blind label set, v2.6 misses fewer or the same.

**For the owner (not changed here: the routine's rule and the gate are the owner's):** for the fourth run in a row, the gate on two-pass agreement labels promotes v2.6, and the routine's rule holds it only on template-intent labels. Whether those labels should count toward "misses fewer in total" is a rule the owner sets.

## What the labels found wrong (engine findings for the red team; `core/` is not edited from this routine)

Today's engine plus veto on batch-008:

**Addressed to someone else by a Hebrew name-first greeting, not caught.** New in this batch.
- 26: «עומר שלום, אצטרף לשיחה ביום שני ב-13:00» becomes a calendar event.
- 27: «אבי שלום, אושר תקציב של ₪3,400» becomes a task.

**Undated asks get a draft.** This continues since batch-006.
- 14: «… ASAP»
- 34: «תוכל בבקשה לשלוח לי את החשבונית?»
- 45: "Could you give me a rough estimate on the renovation?"
- 69: "Please make a spreadsheet tracking the launch checklist."

**Other wrong Do Its**

| item | mail | what the engine did | repeats |
|---|---|---|---|
| 33 | the sender's own promise «אשלח העתק דרכון מחר» | a task for the person | fourth batch |
| 39 | a Drive save on an Outlook mailbox | Drive save | fifth batch in a row |

**Wrong actions**

| item | mail | engine offers | label |
|---|---|---|---|
| 28 | a note to self «pls תשמור את הקובץ המצורף בגוגל דרייב» (Gmail, 1 attachment) | a task | file_save |
| 29 | attach-to-invite | a task | draft |
| 35 | «נשמח אם תוכלו להכין את החוזה החתום עד סוף היום?» | a reply | task (both passes) |

## Reproduce (CPU)

As BATCH-007.md, plus:

```sh
cd model && GLANCE_V25=d GLANCE_NOW=2026-10-07T12:00:00+03:00 node train/gap-labels-v25.cjs && node train/ref-fix.cjs features-v27
.venv/bin/python train/train-v2.py --feat features-v27f --tag v27f --out v27      # full pinned env
```
