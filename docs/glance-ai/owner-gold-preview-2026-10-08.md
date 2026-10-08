# Owner-label preview, 2026-10-08

Glance closes open loops. Gmail is where it starts today.

**provisional / not owner-verified.** Owner-verified labels are still 0. This page scores the chief of staff's proposed answers for batch-001. It is not owner gold.

## Product definition

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Gmail is the current primary entry surface. Glance stays silent when it is uncertain, never sends, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.

## Implementation status

Batch-001 is 19 synthetic cases (`v2syn-*` and two repo-test ids) where engine 0.9.35 and model v2 disagree, or where a rule needs the owner's call. The mail text is generated, not customer mail. Items 8 and 17 are marked unsure in this preview and are left out of every headline number. Item 17's note says the close is a save to OneDrive, not a task and not silence. That call is still the owner's.

Scored rows: **17**. Unsure, left out: **2**. Owner-verified among the scored rows: **0**.

### Unsure (not in the numbers)

- Item 8 `v2syn-405`: Hi all, approve onboarding asap: בקשה לכל הקבוצה
- Item 17 `v2syn-24392`: זו בקשה ברורה עם מועד (תשמור ב-One Drive עד יום ראשון). הפעולה הנכונה היא שמירה ל-OneDrive, לא משימה ולא שתיקה.

### Strict score on the provisional labels

A card on a silence label is a wrong Do-It. Silence on an ask label is a missed close. A different action when both sides show a card is a wrong action. Every figure is count / denominator. Qwen is scored on the step (draft, task, calendar, file_save) and only where the cached prediction covers the case.

| system | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |
|---|---|---|---|---|---|---|---|---|
| v2 alone | 17 | 42.9% (3/7) | 0.0% (0/10) | 0.0% (0/10) | 33.3% (2/6) | 100.0% (1/1) | 0.0% (0/6) | 0.0% (0/4) |
| v2+veto | 17 | 28.6% (2/7) | 0.0% (0/10) | 0.0% (0/10) | 16.7% (1/6) | 100.0% (1/1) | 0.0% (0/6) | 0.0% (0/4) |
| v2.1+veto | 17 | 0.0% (0/7) | 40.0% (4/10) | 0.0% (0/10) | 0.0% (0/6) | 0.0% (0/1) | 33.3% (2/6) | 50.0% (2/4) |
| engine tip | 17 | 57.1% (4/7) | 80.0% (8/10) | 10.0% (1/10) | 66.7% (4/6) | 0.0% (0/1) | 100.0% (6/6) | 50.0% (2/4) |
| gated Qwen propose-only | 5 | 33.3% (1/3) | 50.0% (1/2) | 0.0% (0/2) | 50.0% (1/2) | 0.0% (0/1) | — (0/0) | 50.0% (1/2) |

Gated Qwen cache does not cover 12 of the 17 scored cases: `v2syn-20323`, `v2syn-20284`, `v2syn-20987`, `v2syn-17987`, `v2syn-19085`, `v2syn-21422`, `v2syn-12147`, `v2syn-6931`, `v2syn-7013`, `v2syn-10482`, `v2syn-25034`, `v2syn-797`.

The current engine (tip) and the stored engine 0.9.35 label differ on: item 15 `v2syn-10482` tip SILENT, engine 0.9.35 follow-up-ask / draft.

### Case by case

| item | lang | provisional label | v2 alone | v2+veto | v2.1+veto | engine tip | Qwen step |
|---|---|---|---|---|---|---|---|
| 1 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | not covered |
| 2 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | not covered |
| 3 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | SILENT | not covered |
| 4 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | SILENT | not covered |
| 5 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | not covered |
| 6 | he | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | not covered |
| 7 | en | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | follow-up-ask / draft | SILENT | not covered |
| 9 | en | commitment / task | commitment / task | commitment / task | SILENT | SILENT | SILENT |
| 10 | he | SILENT | calendar-hold / calendar | calendar-hold / calendar | SILENT | SILENT | SILENT |
| 11 | en | SILENT | confirmed-amount / task | confirmed-amount / task | SILENT | SILENT | SILENT |
| 12 | he | SILENT | SILENT | SILENT | SILENT | follow-up-ask / draft | not covered |
| 13 | he | SILENT | follow-up-ask / draft | SILENT | SILENT | follow-up-ask / draft | not covered |
| 14 | he | SILENT | SILENT | SILENT | SILENT | confirmed-amount / task | task |
| 15 | he | SILENT | SILENT | SILENT | SILENT | SILENT | not covered |
| 16 | he | SILENT | SILENT | SILENT | SILENT | drive-file / file_save | not covered |
| 18 | en | commitment / task | commitment / task | commitment / task | commitment / task | dated-commitment / task | not covered |
| 19 | en | event / calendar | event / calendar | event / calendar | SILENT | event / calendar | calendar |

### Strict held-out wrong-Do-It, shipped v2, before and after

The held-out file is `model/artifacts/v2.test-preds.jsonl` (6982 rows). Before uses the machine reference. After replaces that reference for the 17 provisional rows and leaves every other row as it was. These ids sit in the test split, so the change is in the eval labels. The shipped weights are untouched.

| | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |
|---|---|---|---|---|---|---|---|---|
| v2+veto before | 6982 | 1.4% (82/5727) | 50.8% (637/1255) | 2.9% (37/1255) | 2.1% (62/3016) | 0.7% (20/2711) | 47.1% (227/482) | 53.0% (410/773) |
| v2+veto after | 6982 | 1.3% (74/5720) | 50.4% (636/1262) | 2.8% (35/1262) | 1.9% (56/3011) | 0.7% (18/2709) | 46.4% (226/487) | 52.9% (410/775) |
| v2 alone before | 6982 | 11.2% (642/5727) | 47.0% (590/1255) | 3.0% (38/1255) | 10.4% (315/3016) | 12.1% (327/2711) | 42.5% (205/482) | 49.8% (385/773) |
| v2 alone after | 6982 | 11.1% (634/5720) | 46.7% (589/1262) | 2.9% (36/1262) | 10.3% (309/3011) | 12.0% (325/2709) | 41.9% (204/487) | 49.7% (385/775) |

### CPU refit

train-v2.py ran with tag `v2-owner-dryrun` and wrote its report under `glance-ai/labeling/dry-run/artifacts/`. The shipped weight files were left in place. Override hits: train 0, val 0, test 17. The refit strict wrong-Do-It on the overridden test labels is 1.3% (74/5720) (tau 0.97). sklearn 1.9.1. This refit is a dry-run. It is not a candidate, and it is provisional / not owner-verified. No training row changed, because every answered id is in the test split. The before/after table above is the effect of the new labels on the shipped decisions.

### Command when the owner's answers are in

```
node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json
```

The answers file is keyed by batch item number or case id. Each mark is ✅, ⚙️, 🤫, or ❓, plus an optional note. `labeledBy` is `sali` for an owner-verified row. Any other `labeledBy` is stored and scored, and `ownerVerified` stays false. The command refuses a file that asks for `ownerVerified: true` under another name. ❓ rows stay out of the headline. The dry-run writes under `glance-ai/labeling/dry-run/` and does not replace `model/artifacts/v2.gate.weights.json`.
