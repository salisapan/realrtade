# Batch-004: 100 independent labels (Claude), not owner-verified

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing here is wired into the extension, and v2 stays the default model.

100 synthetic cases from the v2 test split, made by `make-batch.cjs --batch 4 --size 100 --seed 4`. That script is the generalised `make-batch-003.cjs`, which stays as it was to reproduce batch-003. The batch has one case per template and no case from any earlier `batch-*.json`. It splits into:

- 30 engine blind spots (15 Hebrew, 15 English)
- 20 reference shows (10 / 10)
- 40 harder silences (20 / 20)
- 10 easy silences (5 / 5)

The pools lean toward where the systems disagreed most on batch-003. Each of these scenarios comes up twice per round-robin turn: commitment_reader, meeting, own_commitment_self, payment, request_reply, repo, repo-test, third_party, ooo, cancelled, past.

Claude labelled every case **blind**, from `batch-004.blind.jsonl` alone. Every label was written before `batch-004.json`, the engine or any model answer was opened: the labels file is from 15:01, the comparison from 15:16. The rules are the same as `BATCH-003.md`, including the confirmed-amount-as-task rule.

The labels are:

| label | count |
|---|---|
| silent | 53 (6 of them undated asks) |
| draft | 17 |
| task | 13 |
| calendar | 7 |
| CONTEXT (group greeting or Cc-only ask) | 7 |
| file_save | 3 |

`labeledBy` is `claude` and `ownerVerified` is false on every row. Owner-verified labels are still 0 of 200. There is only one pass, so batch-004 adds no two-pass agreement labels: the agreement labels are still the 174 from batch-003.

Files:

- `batch-004.json`: the full record
- `batch-004.blind.jsonl`: what the labeller saw
- `batch-004.claude-labels.jsonl`: the labels
- `batch-004.comparison.jsonl`: the labels next to every system

## Results against these labels (93 scored: 53 silent, 40 act; the 7 CONTEXT rows are left out)

`node labeling/score-batches.cjs`. It reproduces the batch-003 table of `BATCH-003.md` exactly. "Engine" is this repository's rules engine through the lab teacher; "veto" is the lab's `vb`/`vp`.

| system | wrong Do It | missed | HE missed | EN missed | wrong action |
|---|---|---|---|---|---|
| reference (v2's training labels) | 7 / 53 | 28 / 40 | 12 / 19 | 16 / 21 | 2 |
| engine + veto | 7 / 53 | 28 / 40 | 12 / 19 | 16 / 21 | 2 |
| v2 alone | 0 / 53 | 33 / 40 | 16 / 19 | 17 / 21 | 0 |
| v2.3 alone | 0 / 53 | 30 / 40 | 12 / 19 | 18 / 21 | 0 |
| v2.4 candidate alone | 0 / 53 | 27 / 40 | 14 / 19 | 13 / 21 | 0 |
| engine + veto, then v2 | 7 / 53 | 27 / 40 | 11 / 19 | 16 / 21 | 2 |
| **engine + veto, then v2.3 (best so far)** | **7 / 53** | **24 / 40** | **8 / 19** | **16 / 21** | **2** |
| engine + veto, then v2.4 candidate | 7 / 53 | 23 / 40 | 10 / 19 | 13 / 21 | 2 |
| engine + veto, then v2.4 with tau target 0.20% | 7 / 53 | 25 / 40 | 10 / 19 | 15 / 21 | 2 |

The wrong Do Its split by language as Hebrew 3 / 29 and English 4 / 24. In the product order every one of them comes from the engine; the models add none.

## This run's candidates (v2.4) and why none is promoted

The two changes are in `model/train/gap-labels-v24.cjs`. They were trained with the same trainer.

1. **A deadline the device does not read counts as dated.** The words are "today", "by end of week", «היום» and «סוף השבוע». In batch-004, 6 of the 16 English misses carry them.
2. **A dated note to self is a task.** Before this change it was left unsure as "not inbound". A note to self with a clock time stays unsure.

The second variant also tightens the tau target from 0.29% to 0.20% wrong Do It on the out-of-fold set.

Product order, on every label set:

| label set | v2.3 (best) | v2.4 | v2.4, tau target 0.20% |
|---|---|---|---|
| v2 test split, wrong Do It / 4,938 | 9 | **11** | 9 |
| v2 test split, missed / 1,252 | 32 | 28 | 25 |
| v2 test split, engine blind spots caught / 315 | 96 (EN 8/52) | 97 (EN 9/52) | 84 (EN 7/52) |
| batch-003 (Claude), wrong Do It / missed | 24 / 41 | 24 / 41 | 24 / 43 |
| agreement-gold (174), wrong Do It / missed | 24 / 37 | 24 / 37 | 24 / 39 |
| batch-004 (Claude, hold-out), wrong Do It / missed | 7 / 24 | 7 / 23 | 7 / 25 |

The routine's rule for a new best is: no more wrong Do Its on every label set, and fewer misses in total.

- **v2.4 fails** on the v2 test split: 2 more wrong Do Its. Three of its 4 new ones are real product errors:
  - "save this attachment to OneDrive" with nothing attached
  - "share the receipt by EOD" (receipts follow `docs/resolution-paths.md`)
  - an undated «לפני החג»
- **The 0.20% variant fails** on total misses. It has 7 fewer on the test reference rows, but 12 fewer blind spots caught and 2 + 1 + 2 more on the Claude label sets.

The promotion gate (`oss/finetune/promote_gate.cjs`, base v2.3, inputs from `labeling/gate-inputs.cjs`) agrees:

| label set | v2.4 | v2.4, tau target 0.20% |
|---|---|---|
| batch-004, product order | HOLD (Hebrew misses 8 → 10) | HOLD (25 against 24 missed) |
| agreement-gold, product order | HOLD (no fewer misses) | HOLD (39 against 37) |
| agreement-gold, model alone | "better on spec labels" (54 against 57 missed, same wrong Do Its); cannot promote with 174 agreement labels and 0 owner-verified | HOLD |

**v2.3 stays the best so far.** No weights were exported, so there was nothing to parity-check. The English gain is real: alone, v2.4 misses 13 / 21 English cases on batch-004 against 18. The lesson for the next run is to keep that gain without the extra wrong Do Its. Two ideas: a tau per language, or teaching the gate the product's receipt and attachment-less-save silences.

## What the labels found wrong

**Engine (for the red team; `core/` is not edited from this routine).** The engine plus veto made these 7 wrong Do Its on batch-004:

| item | mail | what the engine did | repeats batch-003 |
|---|---|---|---|
| 36 | a webinar invitation | calendar | item 65 |
| 37 | a note to self with an unconfirmed proposal ("נשמח לקבוע call ביום שלישי בשעה 11:15") | calendar | |
| 40 | the sender's own promise ("אשלח העתק דרכון מחר") | a task for the person | |
| 41 | a meeting postponed with no new time | calendar | |
| 44 | a Drive save on an Outlook mailbox | file_save | items 93, 100 |
| 48 | an interview that already happened | calendar | item 97 |
| 50 | an undated "before the procedure" ask | draft | |

**Parser (`core/extract.js` `parseDate`).** It reads "EOD", "tomorrow" and «עד סוף היום». It does not read "today", "by end of week", «היום» or «סוף השבוע». So the engine stays silent on dated asks like "Please wire ₪15,000 by end of week" and "please send the lease today", and so do the v2.3 gap labels.

**Reference rows that are real asks.** The engine is silent on these and the v2 reference has them as sure silences:

| item | mail |
|---|---|
| 56 | «מאשרת את הסכום: ₪89» |
| 65 | «אפשר לשלוח לי את הקבלה עד סוף היום?» |
| 72 | "you said you would review the W-9 on Monday" |
| 83 | "can you send the resume on Monday?" |
| 86 | "We still need the expense report from you before Sunday" |

**Lab data (fixed for the v2.4 candidate only, in its own label script).** v2.3 left dated notes to self unsure, although the product reads a reminder to self as a task.

**Promotion gate.** A `CONTEXT` label passed through `--labels` is scored as an act, because the gate leaves out only `AMBIGUOUS` and `ANY`. This run passes batch-004 through `--cases`, where `gate-inputs.cjs` maps `CONTEXT` to `AMBIGUOUS`. The gate's rules were not changed.

**The labeller.** One text appears in both batches with different labels: "I will call the bank October 19 at 9am" is task in batch-003 item 96 (both passes) and calendar in batch-004 item 47. A promise to self with a clock time is not settled, and v2.4's labels leave it unsure. The blind label was kept as written. Two other inconsistencies on rules where no answer is settled:

- an inbound meeting proposal is labelled calendar (item 3), but your own proposal is labelled silent (items 37, 60)
- «לפני החג» is labelled a dated task in item 10

## Reproduce (CPU)

```sh
# from glance-ai, dataset as in model/V23.md (run-cpu-checks.sh step 4 env)
node labeling/make-batch.cjs --batch 4 --size 100 --seed 4 --prefer commitment_reader,meeting,own_commitment_self,payment,request_reply,repo,repo-test,third_party,ooo,cancelled,past
cd model && GLANCE_NOW=2026-10-07T12:00:00+03:00 node train/gap-labels-v24.cjs
.venv/bin/python train/train-v2.py --feat features-v24 --tag v24 --out v24/export
.venv/bin/python train/train-v2.py --feat features-v24 --tag v24t20 --out v24/t20 --target 0.0020
.venv/bin/python train/compare-v2n.py v23=artifacts/v23.test-preds.jsonl v24=v24/export/v24.test-preds.jsonl t20=v24/t20/v24t20.test-preds.jsonl
cd .. && node labeling/score-batches.cjs --models v2=model/v23/base/base.test-preds.jsonl,v23=model/artifacts/v23.test-preds.jsonl,v24=model/v24/export/v24.test-preds.jsonl
```
