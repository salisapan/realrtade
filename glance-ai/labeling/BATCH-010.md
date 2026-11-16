# Batch-010: 93 labels, two blind passes, a text-bound hold-out; v3.3 stays the lab's best, v3.3a (stricter step floor) held

Glance closes open loops. Gmail is where it starts today.

Lab only. Nothing is wired into the extension, and v2 stays the default model. The labels are Claude's (`claude`, `claude-pass2`), never owner-verified: owner-verified labels are still 0 of 200, and no own-use file (path A) has been handed over.

This is the model trainer run of 2026-11-16. There was no run on Thursday 11-12: no scheduled message for it reached this session.

## Before the run: the lab changed under this routine

- **Label ids were positional.** The model-lab session found this on 2026-11-11 (`glance-ai/model/V23.md`, CORRECTION). Labels are now joined by text: `labeling/frozen-eval.jsonl` holds batches 003 to 008, `labeling/sealed/` holds batch-009, sealed. So this batch is batch-010.
- **The pinned dataset hash moved** to `beb196f7…` (content ids). The rebuild here matches it.
- **The lab's best is v3.3**, not v2.3. v3.3 is trained on the teacher's 10,000 labels alone, with the payment-back audit and a step-confidence floor; it was trained 2026-11-12. It was reproduced here exactly: 19/299 wrong Do Its, 25.6% missed and 17 wrong actions on the frozen set.
- **Undated asks follow owner decision C-4**: they get a Do It, and are flagged `undatedAsk`. This replaces the routine's older "undated asks are silent" rule; the labelling rules are `labeling/pass-rules.md`.
- **PR #280** (the 11-09 run) used batch numbers 007 and 008, which the lab has since used for other batches, and joined labels by id. It is superseded by the lab's text-bound sets and closed unmerged.

## Tools changed (lab only)

- `labeling/make-batch.cjs` excludes a case by its normalised text, not its positional id. It checks every batch file here and in `sealed/` (read by the script, never printed, so the seal stands), and the frozen sets.
- `model/train/export-frozen.cjs` takes `FROZEN_BATCHES`, `FROZEN_OUT` and `FROZEN_FEAT`, so a later batch is exported as its own hold-out. Without them the output is the same as before.
  - Batch-010 is in `labeling/holdout/frozen-b010.jsonl`.
  - None of its 93 texts is in the train or val split.

## The batch

`make-batch.cjs --batch 10 --size 100 --seed 10 --prefer payment,task_ask,request_reply,commitment_reader,meeting,file_place,third_party,own_commitment_self` produced **93 cases**: the English blind-spot pool ran out at 8.

**Pass 1** (written from `batch-010.blind.jsonl` only, before anything else was opened):

| label | count |
|---|---|
| silent | 41 |
| draft | 15 |
| task | 14 |
| calendar | 4 |
| file_save | 3 |
| CONTEXT | 15 |
| UNSURE | 1 |

7 of the offers rest on an ask with no date.

**Pass 2** came from a fresh agent. It read only a scratch file holding `pass-rules.md` and the cases, and reported 1 tool call.
- It agrees on 65 of the 71 cases both decided (91.5%). That is less than the last batches; the passes look more independent.
- The six disagreements:
  - 8: «לפי מה שאמרת, תחזור אליי עם תשובה עד מחר בבוקר»: task or draft.
  - 12: "follow up on the pilot by the 20th": draft or task.
  - 61: the reader's own outbound proposal of a call with a day and a time: silent or calendar.
  - 70: the hedge "if you have a sec, maybe glance at…": silent or task.
  - 88: «אפשר שתהיה בשדה התעופה בחמש…»: draft or task.
  - 91: a call on a date already past: silent or calendar.
- Pass 2 also marked 9 mails addressed by name to someone else as CONTEXT, where pass 1 said silent because they ask nothing.

**Agreement labels on batch-010: 65** (32 silent, 33 act). In all, the lab has 887 labelled texts: 701 frozen, 93 sealed and 93 here. NOT owner-verified.

## This run's change: v3.3a

v3.3a is v3.3 with a stricter step-confidence floor: `--action-target 0.03` instead of 0.05.
- It was chosen before any score, aimed at the wrong actions the gate holds v3.3 on.
- kappa is still picked on grouped out-of-fold data over training rows, not on any label set.

## Numbers (product order: today's engine plus veto, the engine's hard quiets veto the model, then the model; two-pass agreement labels)

| label set | engine alone | engine + v2 (default) | engine + v3.3 (best) | engine + v3.3a |
|---|---|---|---|---|
| frozen 003–008: wrong Do It / missed / wrong action | 21/299, 125/266, 12 | 20/299, 116/266, 15 | **19/299, 68/266 (25.6%), 17** | 19/299, 75/266 (28.2%), 16 |
| validation 007+008 | 7/81, 46/90, 8 | 6/81, 43/90, 10 | **5/81, 27/90 (30.0%), 10** | 5/81, 30/90, 10 |
| **batch-010, hold-out** | 3/32, 14/33, 1 | 3/32, 15/33, 1 | **3/32, 10/33 (30.3%), 2** | 3/32, 10/33, 2 |
| batch-010, Hebrew / English missed | 7/18, 7/15 | 7/18, 8/15 | 4/18, 6/15 | 4/18, 6/15 |

The gate (`promote_gate.cjs`):
- **v3.3a against v3.3: HOLD everywhere.** It misses more (frozen 75 against 68, validation 30 against 27) and is equal on batch-010. It saves one wrong action on the frozen set (16 against 17).
- **v3.3 against v2 on batch-010: HOLD on one wrong action** (2 against 1). That is the same reason the frozen set holds it (17 against 15).
- On the hold-out, v3.3 misses 5 fewer closes than v2 (10 against 15) and adds no wrong Do It. All 3 wrong Do Its are the engine's own.

**v3.3 stays the lab's best; v2 stays the default.** No weights were exported.

**The model's wrong action on batch-010 is a training-label error.**
- Item 22 ("Can you transfer $89 to the vendor by end of week?") is a payment to a third party: a task under `pass-rules.md` rule 9.
- v3.3 offers a draft. Its audit rule (`gap-labels-v33.cjs`) turns every teacher `task` in the generator's `payment` family into a draft, without checking whether the payee is the sender.
- A narrower audit (a draft only when no third party such as "the vendor", «לספק» or "the supplier" is named) is the next run's pre-registered change.

## What the labels found wrong in today's engine (default switches; `core/` is not edited from this routine)

**Wrong Do Its: a confirmation with an amount becomes a task** (3 of 3). This is C-1; the `confirmedAmountSilent` option exists and is off.
- 26: «אושר תקציב של ₪18,500 להמיגרציה»
- 36: "Approved: $89 for the budget."
- 33: «אושר רשמית + חוזה»

**New: a follow-up nudge is read as noise.** "Sali, just bumping this, can you send the onboarding checklist by Wednesday, October 14?" is silenced with `quiet:noise`.

**Dated asks the engine misses** (`intent-null`):
- 21: "any chance you can send the SOW by Wednesday, October 14?"
- 23: "Kindly share the CV by Oct 20."
- 18: "need that signed contract by Wednesday … pls"
- 15: «תזכורת: יתרה פתוחה של ₪7,250, נשמח להסדרה מחר»
- 11: «יש להעביר ₪89.90 ביום שני»
- 5: «צריך לשלם ₪500 … עד יום שישי»
- 22: "Can you transfer $89 to the vendor by end of week?"

**New: the reader's promise in the feminine present is missed.** «סיכמנו שאת שולחת את נספח ב׳ עד יום שישי» gets `intent-null`, while «סיכמנו שתשלח» is read as a commitment.

**Wrong action**
- 43: "Please chase the vendor about the invoice." The engine offers a draft; C-7 says a task.

**Undated asks missed** (C-4):
- 6: «תשלח בבקשה את האסמכתא … ASAP»
- 17: "Please transfer the €750 deposit asap"
- 49: the note to self «בבקשה לפתוח מסמך חדש…»
- 81: "Please create a new doc for the migration notes."

## Reproduce (CPU)

```sh
# glance-ai, env as run-cpu-checks.sh step 4 (GLANCE_TIP, GLANCE_V2_ENGINE=0.9.35, GLANCE_NOW, GLANCE_ENGINE_ROOTS)
node model/dataset/build-dataset.cjs && node model/dataset/v2/build-dataset-v2.cjs        # sha256 beb196f7…
cd model && node train/export-features-v2.cjs
FROZEN_BATCHES=010 FROZEN_OUT=labeling/holdout/frozen-b010.jsonl FROZEN_FEAT=features-b010 node train/export-frozen.cjs
node train/gap-labels-v23.cjs && node train/gap-labels-v24.cjs && GLANCE_V25=c node train/gap-labels-v25.cjs && GLANCE_V25=c node train/gap-labels-v28.cjs
node train/gap-labels-v29.cjs && TEACHER_LABELS=teacher/teacher-labels-final.jsonl K=1 node train/gap-labels-v31.cjs
TEACHER_LABELS=teacher/teacher-labels-final.jsonl node train/gap-labels-v32.cjs && node train/gap-labels-v33.cjs
.venv/bin/python train/train-v2.py --tag v2 --out v2x/fz-v2 --predict-set features-frozen/frozen.jsonl --no-export
.venv/bin/python train/train-v2.py --feat features-v33 --tag v33 --out v2x/fz-v33 --predict-set features-frozen/frozen.jsonl --no-export --action-target 0.05
.venv/bin/python train/train-v2.py --feat features-v33 --tag v33a --out v2x/fz-v33a --predict-set features-frozen/frozen.jsonl --no-export --action-target 0.03
for t in v2 v33 v33a; do .venv/bin/python train/predict-set.py --model v2x/fz-$t/$t.model.pkl --set features-b010/frozen.jsonl --out v2x/fz-$t/$t.b010-preds.jsonl; done
cd .. && node scoreboard/run.cjs --models v2=model/v2x/fz-v2/v2.extra-preds.jsonl,v33=...,v33a=... --gate-base v33 --hard-quiets A [--batches 007,008]
node scoreboard/run.cjs --models v2=model/v2x/fz-v2/v2.b010-preds.jsonl,... --frozen labeling/holdout/frozen-b010.jsonl --gate-base v2 --hard-quiets A
```
