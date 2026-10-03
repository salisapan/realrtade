# The local intent engine

> Written 2026-10-02. Rebuilt the same day after a container loss; numbers re-measured from the retrained weights. Implements `docs/local-first-principle.md`: our own code
> recognises intent before any external model is involved, and no feature
> depends on one.

## 1. The tiers

| Tier | Where | What it does |
|---|---|---|
| 0 | `core/request-types.js` | Structure and vocabulary: a sentence is FRAME (how it is asked) + ACTION (what is wanted) + OBJECT (of what), English and Hebrew. Exact, fast, very precise, narrow. |
| 1 | `core/intent-model.js` + `core/lang-normalize.js` | A small statistical model that runs on the device. It generalises to phrasings no list contains. |
| 2 | (external model) | **Not used.** Never asked first, never required, never allowed to close or write anything. `REMOTE_CLASSIFY` stays `false`. The pipeline's `unsure` answer is the only hook a future, optional, masked, Pro-only last resort would use. |

`core/intent-pipeline.js` combines tiers 0 and 1, and each checks the other:
the model can veto the lexicon when it is nearly certain a sentence is only a
statement (0.995), and the model can propose what the lexicon has no frame for,
but only when it is confident (0.75) **and** can name the action. When neither
is sure the answer is "unsure" and the product stays silent.

## 2. What the model is

- Features (`lang-normalize.js`): English stems and contractions, Hebrew
  prefix/suffix forms (the raw form is always kept), numbers/money/dates/links
  as placeholders, negation marked on the words it governs, word and character
  n-grams (typo and inflection robust), sentence shape (question, person,
  length), and the lexicons as evidence.
- Two softmax heads over 16,384 hashed features: ACT (ASK, PROMISE, INFORM,
  ACK) and ACTION (pay, sign, approve, confirm, schedule, decide, review, join,
  complete, send, reply, none). The action head lets it name what is asked even
  for a verb nobody listed ("take another pass" -> review).
- Weights: int8, 342 KB, in `core/intent-model-weights.js`. Pure JavaScript, no
  dependency, no download, no network. 1,000 sentences classify in well under
  three seconds.
- Trained by `node scripts/train-intent-model.cjs`: four models, each on its
  own generated dataset (28,000 sentences from a grammar in
  `scripts/intent/generate.cjs`), weights averaged. Deterministic. Retrain
  after changing the grammar or the features.

## 3. How it is measured, and what the numbers do not say

Two hand-written sets, never used to learn weights:

- `test/fixtures/intent-gold.json` (193 sentences). Even rows set one number
  (the softmax temperature); odd rows are held out.
- `test/fixtures/intent-blind.json` (108 sentences). Written once, in varied
  business domains, and meant to be the honest test.

Results (`docs/intent-model-metrics.json`, `test/intent-model-corpus.cjs`):

| Blind set (n=108) | Precision | Recall |
|---|---|---|
| Word lists only: asks | 1.00 | **0.26** |
| Word lists only: promises | 1.00 | **0.33** |
| Pipeline: asks | 1.00 | **0.68** |
| Pipeline: promises | 1.00 | **0.75** |

On the dev set the pipeline reaches asks P 0.98 / R 0.89 and promises
P 1.00 / R 0.88. The model alone gets the speech act right about 90% of the time on
the blind set (Hebrew is the weaker language).

Read these honestly:
- **Small sets.** 108 and 193 sentences. The error bars are wide: a single
  sentence moves a recall figure by about 3 points.
- **The blind set is not perfectly blind.** After seeing its aggregate scores I
  adjusted decision thresholds, and I added generic decoy phrases ("Please find
  attached", idioms, social questions) to the generator after failures that
  also appeared in my own earlier tests (the "Will you be at the offsite…" family was added this way, after a regression test caught it). No evaluation sentence is in the
  generator, but its recall numbers are somewhat optimistic.
- **The training data is synthetic.** The model has learned my grammar plus
  noise. Real inboxes are messier. Expect lower recall and watch precision on
  real mail before trusting these figures.
- **Why recall is lower than the model alone.** The pipeline holds precision at
  1.00 by refusing a model suggestion it cannot attach an action to. That is the
  silence-over-a-wrong-card rule, bought with recall.

## 4. Learning on the device

When someone turns a card down, or accepts one the model was unsure about,
`FlowIntentModel.learn()` makes one small correction. It is clipped (a handful
of mistaken clicks cannot flip a clear case), capped at 4,000 entries, and
stores only feature numbers: no text. Reset by clearing the extension's
storage. Confirming something the model already knew changes nothing.

## 5. Where it is used

`FlowFollowUp.classifyOutgoing` and `classifyCommitment` (asks and promises in
your own messages), and the meeting debrief. It is not yet connected to
`core/intent.js`, the engine that judges incoming mail; that engine is large and
precision-tuned, and replacing its gates should be a separate, measured change.

## 6. Extending it

1. Add vocabulary to `core/request-types.js` for exactness, or phrasing families
   to `scripts/intent/generate.cjs` for generalisation.
2. Add a hand-written sentence to a fixture only if it was not used to design
   the change.
3. `node scripts/train-intent-model.cjs`, then `node test/intent-model-corpus.cjs`.
   The test enforces precision >= 0.97 and recall at least double the lists.
4. Never lower a precision gate to raise recall.

## 7. Known weak spots

Hebrew morphology (colloquial and slang), long multi-clause sentences (the
pipeline reads sentence by sentence), sarcasm, requests hidden in quoted text,
and any language other than English and Hebrew. Topic-style questions
("Will you be at the offsite?") are deliberately not treated as tasks.

## 8. Added 2026-10-02: short chasers, evidence, local-hit accounting

- `FlowRequestTypes.detectShortAsk`: whole-message short asks ("Any update?",
  "Signed yet?", `מה הסטטוס?`) recognised on shape, pipeline tier `lexicon-short`.
- Every `recognize()` result carries `evidence` (`strong`, `weak`, `strength`): frame,
  action, object, amount, date, addressed-to-them, short-form versus question mark,
  hedge, model confidence. It explains and measures a verdict; it never overrules one.
- `FlowRecognitionStats` counts decisions as local hit, local silence, residual or
  remote; `docs/intent-model-metrics.json` carries `localShare` per set. Reply
  understanding (`core/reply-meaning.js`, `core/story.js`) is described in
  `docs/open-loops.md` §9a and measured in `docs/local-detection-plan.md`.

## 9. Added 2026-10-03: teacher data, structure gate, new-domain evaluation

Superseded headline numbers and the full method are in `docs/ai-engine-upgrade.md`. In short: 675
teacher-authored sentences are mixed into training (`--rep 10`, `--no-teacher` to switch off), the pipeline only
lets the model alone propose an ask or promise when the sentence is shaped like one, and a question the model is
very sure about with no named action is an ask for a reply. Current pipeline numbers: blind set ask recall 0.94,
promise 0.79; held-out new domains (279 sentences) ask 0.85, promise 0.80; precision 1.00 on all sets, all
measured on sentences a model (not a person) wrote, and partly tuned. `scripts/intent/eval-sets.cjs` prints the
current table; `test/intent-model-corpus.cjs` enforces precision >= 0.97 and the recall floors on every set.

