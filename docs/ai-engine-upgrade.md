# The AI engine upgrade: teacher data, a model of each person, labels from outcomes

> Written 2026-10-03. Answers "this feels like a weak AI product". Honest starting point: the
> on-device model was a hashed n-gram classifier trained on text I generated from my own grammar;
> everything after it (reply meaning, one story, files) was rules. This pass makes the learning
> parts real, and says where the numbers stop being trustworthy.
> Companion docs: `docs/intent-model.md`, `docs/local-first-principle.md`, `docs/product-identity.md`.

No external model is called by any of this at run time. The teacher is used at BUILD time.

## 1. Teacher data (large model -> small on-device model)

**What changed.** 675 sentences written by hand by a large model (me), English and Hebrew, across
ten business domains and every register (terse, mobile, formal, typos, slang, mixed), with hard
negatives (timetables, reports of someone else's future, "Please find attached", thanks and
social questions) and the shapes the old model missed (status questions, indirect asks, Hebrew
imperatives). They are repeated 10x with light augmentation and mixed into the grammar data
(`scripts/intent/teacher/*.py`, built by `build.py` into `scripts/intent/teacher-train.json`;
`node scripts/train-intent-model.cjs`). A separate **279-sentence evaluation set in domains the
training never contained** (healthcare administration, schools, logistics, IT support, events and
non-profits) is `test/fixtures/intent-teacher-eval.json`. 23 training sentences that were
near-copies of the older dev/blind sets were removed by `build.py`.

Two further changes came from reading the errors and are class-level, not sentence-level:
- the pipeline lets the model ALONE propose an ask or a promise only when the sentence is shaped
  like one (addressed to someone or a question; first person with a future marker and no
  negation): a timetable or a report of someone else's future is neither;
- a question the model is very sure is an ask (>= 0.9), with no named action, is an ask for a reply.
  This single rule recovered most of the recall (16 of the 28 missed asks in the new set).

**Measured** (`node scripts/intent/eval-sets.cjs`; before = `docs/intent-teacher-baseline.json`, after
= `docs/intent-teacher-after.json`; precision/recall are the pipeline's, the percentage is the model's
speech-act accuracy):

| Set | Model accuracy | Ask precision | Ask recall | Promise precision | Promise recall |
|---|---|---|---|---|---|
| Dev, odd rows (96) | 98% -> 98% | 0.96 -> 1.00 | 0.84 -> 0.94 | 1.00 -> 1.00 | 0.81 -> 0.91 |
| Blind (108) | 90% -> 92% | 1.00 -> 1.00 | 0.68 -> 0.94 | 1.00 -> 1.00 | 0.75 -> 0.79 |
| Teacher-eval, new domains (279) | 81% -> 88% | 0.99 -> 1.00 | 0.66 -> 0.85 | 0.96 -> 1.00 | 0.69 -> 0.80 |

On the new set, Hebrew accuracy 79% -> 87%, English 84% -> 90%, and naming the right action 39% -> 62%.

**Read this honestly.**
- The teacher wrote the training data AND the new evaluation set. It is the same author's idea of
  realistic mail. That is the biggest weakness of everything above.
- The older blind set is more contaminated than before: I wrote the teacher batches knowing what kinds of
  sentence it had failed on (exact and near copies were removed, the kinds were not).
- The two class-level fixes above were chosen after looking at errors on the new set, so its
  precision of 1.00 is partly tuned. Treat the first-contact number as the 88% model accuracy and the
  recall gain on the new domains, not the last decimal.
- Remaining misses: confident wrong labels such as "Please email the vaccination records to the
  school office." (read as a statement). That is the limit of a bag of n-grams, not of data.
- The only fix for the author problem is real, human-written mail from real inboxes. That set does not
  exist yet (see 5).

## 2. A model of each person (`core/person-model.js`)

The part of Glance that learns about YOU. For each person and kind of loop (reply, payment) the time to
close is modelled as log-normal, fitted by expectation-maximisation with a population prior (a few
pseudo-observations, so one data point never makes an extreme conclusion) and right-censoring (a loop
still open after d days is evidence the person takes at least d days; ignoring open loops flatters slow
people).

Used for: the look-again day of a new loop (only with at least two real closes with that person and no
stated deadline, otherwise the old default), the wait after a chase, a "likely to slip" label on loops
with a date (only with at least three real closes), and money on loops likely to be late in the Pro
summary. Data used: only loops Glance itself closed (hand-closed ones are ignored). Nothing leaves
the device.

**Measured, in simulation only** (`node scripts/person-model-sim.cjs`, 3,000 simulated people per row):

| Closes seen with the person | Fixed rule lands in their sensible window | Model lands in it |
|---|---|---|
| 0 | 27% | 27% (same: defaults for a new person) |
| 2 | 27% | 35% |
| 4 | 25% | 56% |
| 8 | 26% | 71% |
| 15 | 28% | 79% |

Probabilities are calibrated (mean gap between predicted and observed 2.6 points); counting open loops
as censored halves the error for slow people (0.60 -> 0.27 log error). **This shows the estimator
works when response times are log-normal. It does not show real people are.** Real validation needs
real loop history; Glance will have it after a few weeks of use, on the device.

## 3. Labels from outcomes (`core/outcome-labels.js`)

The cheapest training signal is behaviour. If you chase by hand ("Any update?") in a thread where Glance
opened no loop, an earlier sentence of yours WAS an ask the engine missed: that sentence is a labelled
false negative in your own phrasing; the model learns it once (feature numbers only, clipped). A
loop the model alone proposed that then gets a real reply, or a promise you keep, is a gentle
confirmation. No UI, no thumbs, counts only (`outcomeLabels` in storage).

**Measured, in simulation** (`node scripts/intent/outcome-learning-sim.cjs`): replaying 9 missed asks from a
person's own mail raised ask recall on more of the same person's mail from 0.85 to 0.87 and on the blind
set from 0.94 to 0.97 with no loss of precision; learning-rate 4 saturates. That is small and honest:
nine labels cannot do much, and the point of this signal is that a real user generates hundreds. Its value
cannot be demonstrated without real use.

## 4. What this still is not

A pretrained multilingual sentence encoder running on the device (the real step up in language
understanding, expected to fix the confident-wrong class), federated or aggregated learning across
users (the data moat, needs users and a privacy-copy change), and a human-written evaluation set. All
three are proposed, none is built. See `docs/open-tasks.md`.

## 5. Needs the owner

- A real, human-written evaluation set: with your explicit OK I can sample sent mail through the Gmail
  connector, mask it locally and use it ONLY to measure (never committed raw). Without it every number
  here comes from sentences a model wrote.
- Real-Gmail steps 45-50 in `docs/open-loops.md` §9a-iv.
