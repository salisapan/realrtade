# Batch-005: 100 labels, two blind passes, and two lab bugs that changed every earlier number

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing here is wired into the extension, and v2 stays the default model. The labels are Claude's: `labeledBy` is `claude` or `claude-pass2`, and `ownerVerified` is false. Owner-verified labels are still 0 of 200; no own-use file (path A) has been handed over.

This is the model trainer run of 2026-10-19. The run of Thursday 2026-10-15 did not happen: its scheduled message reached this session only on 10-19, together with this one, so this is one run, not two.

## Two lab bugs, found and fixed first

1. **The dataset depended on the day it was built.**
   - The lab teachers (`model/teacher/teacher.cjs`, `engine.cjs`) run the engine in a sandbox whose clock was the real one, not `GLANCE_NOW`.
   - Once the real day passed a date in a mail ("by October 14"), the pinned 0.9.35 engine read that date as past and went silent. 114 test rows changed between the 10-12 build and the 10-19 build.
   - The sandbox clock is now frozen to `GLANCE_NOW`. The rebuilt `dataset/out-v2/all.jsonl` now matches the pinned `dataset/v2/all.jsonl.sha256` **exactly** (`d4aab097…`). That is the mismatch V23.md reported, and it is now explained.
   - Every earlier run (v2.3 on 10-11, batch-003, batch-004) trained and scored on a date-shifted copy.
2. **The lab ran today's engine without the context the browser gives it.**
   - `engine.cjs` called the engine without To, Cc, the mailbox's own address, the person's names or the direction.
   - Today's engine holds a greeted mail until the person's names are known (`names-pending`), and its Cc-only and addressed-to-other rules need the recipients. So "engine + veto" in BATCH-003 and BATCH-004 measured a hobbled engine.
   - The harness now passes that context (`hostCtx`). The pinned 0.9.35 reads none of these fields: the dataset hash is unchanged with and without it.
   - On the agreement labels, the fix recovers 14 closes the engine was missing (113 → 99 missed). It also uncovers one real engine error the hold had been hiding: a Drive save offered on an Outlook mailbox (batch-004 item 44).

So the tables in BATCH-003.md and BATCH-004.md are kept as written, but they are superseded by the tables below. v2 and v2.3 were retrained on the pinned dataset for this run. The retrained v2.3 is not byte-identical to `artifacts/v23.*`, which were trained on the date-shifted copy; the recipe is the same and the artifacts are not overwritten.

One more measurement fix: `train/compare-v2n.py` now compares at step level (task, calendar, draft, file_save), as the product and the gate do. Before, `commitment|task` against `dated-commitment|task` counted as a wrong action although both are the same Do It.

## The batch

`make-batch.cjs --batch 5 --size 100 --seed 5`. Same pools as batch-004: 30 blind spots, 20 shows, 40 hard silences, 10 easy silences, Hebrew and English evenly. It leans toward commitment_reader, own_commitment_self, meeting, request_reply, payment, third_party, past, cancelled, drive_save, onedrive_save and marketing.

**Pass 1** (Claude), blind from `batch-005.blind.jsonl`, written before the record was opened:

| label | count |
|---|---|
| silent | 55 (7 of them undated asks) |
| task | 16 |
| draft | 13 |
| calendar | 5 |
| file_save | 2 |
| CONTEXT | 7 |
| UNSURE | 2 |

The two UNSURE are notes to self with a clock time (items 44, 82). Batch-004 showed that rule is not settled.

**Pass 2:** a fresh agent with only the cases and the written rules; it reported 1 tool call, the read. Since batch-004 the rules state two conventions in words: an ask to do work that is not a reply is a task, and "this week" is a deadline.

Merged with `merge-passes.cjs`:
- 89 of 91 agree (97.8%).
- The two disagreements: item 35, attach a report to a zoom invite (draft or calendar); item 50, "fill out the signed contract by October 15" (draft or task).

**Two-pass agreement labels: 354** (174 + 91 + 89). The gate's basis of 200 is met. They are NOT owner-verified.

## Numbers (pinned dataset; product order = this repo's engine + the lab veto first, the model only where the engine is silent)

Wrong Do It / missed, with Hebrew and English apart where it matters:

| label set | engine + veto | then v2 | then v2.3 (best) | then v2.5a | then v2.5b |
|---|---|---|---|---|---|
| v2 test split (4,935 silent, 1,255 act) | | 9 / 31 | 10 / 26 | 10 / 26 | 12 / 27 |
| v2 test split, blind spots caught / 367 | | 47 | 138 (EN 13/52) | 140 (EN 13/52) | 134 |
| batch-003 (101 silent, 86 act) | 16 / 52 | 18 / 47 | 18 / 40 | 18 / 39 | 18 / 36 |
| batch-004 (53, 40) | 4 / 27 | 4 / 25 | 4 / 21 | 4 / 22 | 5 / 19 |
| **batch-005, hold-out (55, 36)** | 3 / 25 | 4 / 23 | 5 / 19 (HE 9/17, EN 10/19) | 4 / 19 (HE 9, EN 10) | 4 / 17 (HE 8, EN 9) |
| agreement-gold (208, 146) | 22 / 99 | 25 / 90 | 26 / 75 | 25 / 76 | 26 / 69 |

Two things change with honest measurement:
- The current engine makes far fewer wrong Do Its than BATCH-003 reported (16 / 101 against 23). The 0.9.56 work and the red-team fixes merged since show.
- Every model adds a few wrong Do Its on top of the engine on the blind labels. On agreement-gold: 22 → 25 (v2) and 26 (v2.3).

## This run's candidates, and why none is promoted

**v2.5a** (`train/gap-labels-v25.cjs`, `GLANCE_V25=a`). v2.3 with one change: the engine's commitment blind spots get the reference's own class `commitment|task` instead of a new class. One intention was split over two classes.
- The routine's rule passes: no more wrong Do Its than v2.3 on any label set, and 333 misses in total against 335.
- The gate on 354 agreement labels **holds** it: 76 missed against 75, English 38 against 37.

**v2.5b** (`GLANCE_V25=b`): v2.5a plus v2.4's deadline words and dated notes to self.
- The gate says PROMOTE in the product order: 69 missed against 75, the same 26 wrong Do Its, 5 wrong actions against 6.
- The routine's rule fails: 12 wrong Do Its against 10 on the test split, and 5 against 4 on batch-004.
- Three of its new wrong Do Its are real errors. Two are undated "asap" promises turned into actions: "you said you would review the lease asap", and batch-004's «תחזור אליי עם תשובה ASAP». Learning "today" and "end of week" as deadlines spread to "asap". The third, an annex to attach to an invite read as calendar, is a case the two passes disagree on.

**v2.3 stays the best so far.** A model moves only when both the routine's rule and the gate agree; silence beats a wrong Do It. No weights were exported, so there was nothing to parity-check.

The gate also **holds v2.3 against v2** on these 354 labels: 26 against 25 wrong Do Its, and 6 against 4 wrong actions. v2 stays the default on a basis the gate accepts.

The next run's concrete fix is v2.5b's "asap" leak: keep the deadline words, and teach that "asap" is not a date (a negative gap label).

## What the labels found wrong (engine findings for the red team; `core/` is not edited from this routine)

Today's engine plus veto on batch-005:

**Wrong Do Its**

| item | mail | what the engine did | repeats |
|---|---|---|---|
| 31 | «עומר שלום, אצטרף לשיחה ביום שני ב-13:00», addressed by name to Omer | calendar | |
| 34 | «pls תשמור את הקובץ המצורף בגוגל דרייב» on an **Outlook** mailbox | Drive save | batch-003 93 and 100, batch-004 44 |
| 40 | «אשלח הזמנה ליומן ליום שלישי בקרוב», the sender's own promise | a task for the person | batch-004 40 |

**Wrong action**

| item | mail | engine offers | label |
|---|---|---|---|
| 32 | «התחייבת להעביר את החשבונית עד מחר בבוקר, נכון?» | a reply | task |
| 48 | "I need you to finish the onboarding checklist by Wednesday" | a reply | task (both passes) |

**Dated asks the engine stays silent on**, for example:
- «צריך לשלם ₪18,500 … עד ה-15.10»
- «יש מצב לתאם זום ביום שלישי בשעה 9:00?»
- "you will call the bank today"
- "Please transfer the $4,850 deposit by Friday"
- "Shall we sync Tuesday at 9am"
- dated notes to self (items 4, 9, 18, 23, 61, 70)

## Reproduce (CPU)

```sh
# from glance-ai: env exactly as run-cpu-checks.sh step 4 (GLANCE_TIP, GLANCE_V2_ENGINE=0.9.35, GLANCE_NOW, GLANCE_ENGINE_ROOTS)
node model/dataset/build-dataset.cjs && node model/dataset/v2/build-dataset-v2.cjs   # all.jsonl now matches the pinned sha256
cd model && node train/export-features-v2.cjs && node train/gap-labels-v23.cjs
GLANCE_V25=a node train/gap-labels-v25.cjs && GLANCE_V25=b node train/gap-labels-v25.cjs
.venv/bin/python train/train-v2.py --tag base --out v23/base --no-export
for t in v23 v25a v25b; do .venv/bin/python train/train-v2.py --feat features-$t --tag $t --out v2x/$t; done
.venv/bin/python train/compare-v2n.py v2=v23/base/base.test-preds.jsonl v23=v2x/v23/v23.test-preds.jsonl ...
cd .. && node labeling/score-batches.cjs --models v2=...,v23=...,v25a=...,v25b=...
node labeling/gate-inputs.cjs --out <dir> --labels labeling/agreement-gold.jsonl --models ...   # then promote_gate.cjs per pair
```

If any step runs in a new shell, set the env first. Without `GLANCE_V2_ENGINE=0.9.35`, the features' engine label and veto come from today's engine. This run made that mistake once and redid every training.
