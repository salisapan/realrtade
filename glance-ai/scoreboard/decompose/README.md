# Decompose v1 in the lab: what is measured and how

Glance closes open loops. Gmail is where it starts today.

`flow-trial-extension/core/intent-decompose.js` (switch `aiDecomposeV1`, default off, no host calls it) reads a mail clause by clause with the same judge. Everything here is lab only; the switch is forced on inside `model/teacher/engine.cjs` `decompose()`.

| Script | What it answers | Labels |
|---|---|---|
| `../run.cjs --decompose` | The valid scoreboard (frozen set, by text) with the decomposed engine in place of the whole-mail engine | two-pass agreement, not owner-verified |
| `natural.cjs` | Mails WRITTEN with two or more ask-shaped sentences (`labeling/multi-clause-natural-v0.jsonl`, 33 mails, eval only) | one pass by Claude in session, written before the engine ran; not owner-verified |
| `safety.cjs` | Does the clause pass turn a silent mail into an offer? 7,977 teacher-labelled TRAINING mails | teacher (v3.3 audit) |
| `errors.cjs` | Every remaining miss, wrong Do It and wrong action on the frozen set, by type | two-pass agreement |
| `step-quality.cjs` | For intents found with the right step: is the day right? | `eval-data/shadow-combined-cases.jsonl` set `oss` |
| `run.cjs` (part 2) | STITCHED mails: two training mails joined by "Also," / «בנוסף,» | teacher |

**The stitched numbers test the split, not the product.** They say what joining two intentions costs the engine. They are not recognition on a mail a person wrote with two intentions, and they are never quoted as Glance quality.

## Step quality: the definition

For every intent that was FOUND WITH THE RIGHT STEP, seven parts are each right or wrong against a label:

1. **who acts** (me, the sender, both);
2. **what** (the object of the ask, as quoted words);
3. **with whom** (the counterpart);
4. **when** (the day; the clock when the words carry one; never a date the words do not carry);
5. **amount** (when the mail states one);
6. **the steps, in order** (from the product's own catalog, `core/actions.js PROCESS_CATALOG`; a step outside it is wrong by definition);
7. **what counts as real closure** (`docs/true-close.md`: a sent reply, an event read back, the work done, the file saved and read back; "a draft was prepared" is wrong).

Step quality = the share of right-step intents with all seven right; each part is also reported alone, with its n. A part with no labels prints "no labels" and gets no number.

**Today's labels cover:** the step (frozen set) and the day (81 rows of the `oss` set). **No label exists** for who acts, the clock, the amount, the step sequence or the closure, on any set. Those five need a labelled set (two blind passes, or the structured teacher run of `teacher/RUNBOOK.md`).
