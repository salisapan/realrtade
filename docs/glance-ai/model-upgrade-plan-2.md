# Glance's own model, plan 2: from a measured system to a near-perfect one

Glance closes open loops. Gmail is where it starts today.

**Status of this page.** Plan, written 2026-11-11 at the owner's request («אחרי כל העדכונים והשדרוגים: עוד תוכנית יסודית נוספת… כדי שיהיה מושלם»). It follows `docs/glance-ai/model-upgrade-plan.md` (plan 1, whose Phase 0 is built) and starts from what the corrected measurements say, not from hope. It changes no code, wires no model, turns no switch on, and touches no privacy text. The standing rules stay: a model's answer is a proposal that cites its evidence and never closes, writes or sends alone; the device floor keeps the last word; a feature still works, more quietly, with the model off; silence beats a wrong Do It.

## בעברית, בקצרה

1. **"מושלם" לא קיים כמספר, אבל "קרוב לתקרה" כן.** התקרה היא רמת הרעש של התוויות והחלוקה בין אנשים לגבי מה נכון. התוכנית הזו מודדת קודם את התקרה (הסכמה בין מתייגים בלתי תלויים, כולל אתה), ואז סוגרת את הפער בין המערכת לתקרה.
2. **מה שנמדד נכון עד כה:** ה-"Do It" השגוי של המוצר הוא בעיקר של המנוע (6.4% על סט הוולידציה), לא של המודל הקטן. ההחמצות הן הפער הגדול: המנוע מחמיץ 51% מהסגירות, המודל הקטן מוריד ל-36%, קורא ברמת ענן תחת הרצפה מוריד ל-2.3% אבל מוסיף שגיאות סוג פעולה. הפער הנוכחי הוא לכן בעיית קורא (recall) ובעיית סוג פעולה, לא בעיית מודל קטן בלבד.
3. **שמונה עמודים:** (1) אמת: תוויות בלתי תלויות, סט אטום, תקרת רעש. (2) קורא חזק: מורה ענן ותלמיד על המכשיר. (3) רצפה דטרמיניסטית: מנוע נקי, זוגות ניגוד, הגנות. (4) סוג פעולה ותוכנית סגירה. (5) מנוע נתונים מהעולם האמיתי. (6) למידה מהשימוש עם הוכחת סגירה. (7) מדידה והנדסת שחרור. (8) פרטיות ובטיחות.
4. **12 ניסויים רשומים מראש** עם השערה, מדד וסף הצלחה, כדי שלא נכוון למספר. מה שחוסם אותי: GPU, מפתח API, התיוג שלך, ומכסת השימוש של החשבון. מה שאפשר מיד: סעיף 8.

## 1. What "perfect" can mean, and the ceiling we must measure first

A model cannot be more right than the labels it is judged on, and two careful people disagree on some mails (task or reply, offer or silence). So "perfect" is **the error rate that reaches the label noise floor**, and the first job is to measure that floor, because everything today is judged on labels made by one family of model:

- Two blind Claude passes agree on 93 to 100% of decided rows, but they share a family, a prompt and a habit, so that is an upper bound on agreement, not the noise floor.
- The noise floor needs **independent labellers**: the owner (path A, from real use with read-back proof, 0 of 200 so far), a second model family, and a small adjudicated human set. The gap between "two Claude passes" and "Claude against the owner" is the first thing to learn.
- Until it is measured, a number such as 6.4% wrong Do It has an unknown share that is the label's fault. Every table in this plan says which labels it stands on.

**Targets** (proposals for the owner to change; none is a public claim) on the sealed, owner-verified set at the end of the plan: wrong Do It at most 2% of silent mails; missed closes at most 8%; wrong action at most 5% of offers; Hebrew minus English missed gap at most 3 points; expected calibration error at most 0.03; undo rate at most 5% of approved closes; proof rate at least 95% of approved closes; device p95 at most 50 ms for Tier 0. These are goals to be tested, and the ceiling measurement may move them.

## 2. Where the model stands (corrected, text-bound labels)

All numbers below stand on the frozen, text-bound label set (`glance-ai/labeling/frozen-eval.jsonl`, scoreboard v2); the earlier id-joined numbers were withdrawn (`glance-ai/model/V23.md` CORRECTION). Labels are two blind Claude passes, **not owner-verified**; the owner conventions are in `docs/glance-ai/model-conventions.md`.

| system (product order, engine hard quiets veto the model) | wrong Do It | missed | wrong action |
|---|---|---|---|
| engine alone, 565 agreement rows | 6.7% (20 / 299) | 50.8% (135 / 266) | 16 |
| engine + v2 (default) | 6.4% | 46.6% | 20 |
| engine + v2.6 | 6.4% | 36.5% | 23 |
| engine + v2.9 (work asks and reader promises as tasks) | 6.0% | 38.3% | 24 |
| hold-out only (batches 007 + 008, 171 rows): engine / v2 / v2.6 / v2.9 | 8.6 / 7.4 / 7.4 / 6.2% | 54.4 / 50.0 / 44.4 / 42.2% | 9 / 11 / 13 / 13 |
| zero-shot Claude (reader), 485 rows, under the engine floor | 7.2% | 2.3% | 31 |
| zero-shot Claude alone | 9.8% | 4.1% | 33 |

What these numbers say, in order of weight:

1. **The product thesis is supported on the lab labels:** a strong reader under a deterministic floor keeps wrong Do Its near the engine's own (7.2% against 6.4%) and takes recall from about 50% to about 98%. Without the floor the same reader acts wrongly 9.8%.
2. **The small on-device models are a partial fix:** they cut missed closes (51% to 36 to 38%) without adding wrong Do Its, in development and on two hold-out batches, but they plateau, and v2.3 to v2.9 are all held by the promotion gate on wrong actions.
3. **Wrong action is the next bottleneck, and half of it is the engine's.** Of the task-labelled rows answered with a reply draft, 10 come from the rules engine itself and 4 to 8 from the model. The largest engine class was found on 2026-11-11: **the Hebrew reminder of the reader's own commitment** («סיכמנו שתשלח…», «התחייבת להעביר…») was read as an ask (a reply draft) where the English equivalent was read as a task. Fixed in `core/intent.js` with `test/hebrew-reader-commit-corpus.cjs`. **Measured (E1, frozen set, engine alone):** wrong actions 16 to 12, missed closes 135 to 125, wrong Do Its 20 to 21; hold-out wrong actions 9 to 8 and missed 54.4% to 51.1%. The pre-registered threshold (at least 6 fewer wrong actions and no new wrong Do It) is **not met**: 4 fewer, and one new wrong Do It (`b004-8`, «מאיה שלום… הבטחת לשלם…» addressed to another person), which exposes that the commitment path (and, in the lab harness, the ask path) is not guarded by the addressed-to-other quiet in English either ("Hi Maya, you committed to pay the bill by Thursday"); that guard is a per-user profile feature the owner keeps as is (C-12), so it is recorded in the ratchet, not changed. The model's own class is a work verb ("Please double-check X", "prepare the lease") answered as a reply, which the v2.9 labels (C-7) try to teach.
4. **The engine's own wrong Do Its are the floor of the whole system:** 20 of 299 silent rows, mostly real sentences read wrongly (a confirmed amount read as a task, C-1; an own-promise sentence; a file ask) and the regression ratchet holds 14 of them open (`glance-ai/labeling/ratchet.cjs`).
5. **The veto "the engine's hard quiets also bind the model" is a design rule, not yet a measured gain:** it removed 3 model errors in development and had nothing to remove in 190 hold-out rows.

## 3. The error budget: where the remaining error lives

| Error | Where it comes from | Lever | Owner of the fix |
|---|---|---|---|
| Missed closes (engine 51%) | the engine reads few phrasings; the small model sees few real ones | a stronger reader, then distillation | model |
| Missed closes the reader still has (2.3%) | multi-intent mails, long threads, implicit asks | thread-aware reading, spans, abstention review | model + data |
| Wrong Do It, engine (6.4%) | confirmed amounts read as tasks, own promises, file asks | engine fixes with a corpus each | engine |
| Wrong Do It, model (about 0 now) | asks addressed to others, notices | the floor, hard negatives | floor |
| Wrong action (kind) | reply or task, Hebrew reader promises, work verbs | engine parity fixes, chooser labels, plan model | engine + model |
| Label noise (unknown) | one-family labels, open conventions | independent labellers, adjudication, noise estimation | truth |
| Distribution gap (unknown) | synthetic templates against real mail | own-use data, teacher distillation, real hold-out | data |

## 4. The eight pillars

### P1. Truth: independent labels, a sealed set, a measured ceiling

- **Independent labellers.** Add a second model family as a labeller (outputs only, masked text), then the owner's own-use labels with read-back proof (path A is built in the lab, the on-device export is not), then a small human-adjudicated set. Report agreement between families, and between each and the owner, as the noise-floor estimate.
- **Three sets with three jobs.** `dev` (we look at errors, may tune), `holdout` (compared once per candidate, errors read but never trained on), `sealed` (never opened until a candidate is final; refreshed from new mail each cycle). Today batches 003 to 006 are dev, 007 and 008 are one-time hold-outs and are now spent as decision data; **the next two batches are sealed from the start.**
- **Label noise estimation.** Confident-learning style flags (a row where several models agree against the label) go to adjudication; rows with a non-agreeing independent labeller are excluded from gold, not forced.
- **Power before claims.** A 2-point difference on a 5% error needs about 2,000 rows per arm; the current 565 rows detect only differences of 5 points or more. Every comparison reports the interval (already done) and says whether it can resolve the difference it claims.
- **Stable identities.** Dataset rows are identified by a content hash of the text and metadata, never by position (the 2026-11 incident). Frozen sets are text-bound and a guard test fails if a label cannot be joined to its text.

### P2. A strong reader, then a student

- **Teacher.** A cloud-class reader with the Understanding contract (kind, actor, ask span, evidence span, due span, state, relevance), self-consistency over several readings, and a calibrated confidence; run on masked text only, under the device floor (validator, strict gate, veto), as in `docs/glance-ai/ai-product.md` M1 to M5.
- **Ensemble teacher for labels, not for production:** two reader families plus the rules engine vote; disagreements go to adjudication; the agreed ones become distillation targets with spans.
- **Student.** The on-device model learns from teacher outputs plus the engine's facts: a small multi-task network (relevance, kind, who acts, date presence, abstain) replacing the logistic gate and chooser; start with a boosted or MLP stack over the existing features plus structured frames, move to a distilled multilingual encoder only if it beats the stack on the sealed set. Compare student against teacher on the same cases; the target is the student within a stated gap of the teacher with the cloud off.
- **Abstention is a head, not a threshold.** Train the model to say "unsure" and measure selective accuracy (error at 90, 95, 99% coverage); calibrate per language and kind; never lower a precision gate to raise recall.
- **Hebrew specifically.** Morphology and mixed-language mail are the weakest slice in the data; add Hebrew-first hard cases and report Hebrew separately at every step.

### P3. The floor, kept clean

- **Fix the engine where the corpora find it.** Each defect found by the contrast pairs, the ratchet, the metamorphic checks or a hold-out becomes one change with one corpus and all corpora green. Done 2026-11-11: C-1 as an off-by-default option, the Hebrew reader-commitment parity fix. Waiting on a decision of the product: C-7 in the engine (a work ask as a task), an undated reader promise (C-18, a task by delegation), holiday-relative dates (C-3).
- **Grow the checks that catch it.** Contrast pairs from 18 to 200 (each differing in one fact, EN and HE, written from the conventions and reviewed), metamorphic invariants (greeting, signature, quoting, whitespace, punctuation, case) from 4 to 15, a property test that no model output can bypass the floor.
- **The floor is a published contract:** which engine reasons are hard quiets (the list in `model/runtime/hard-quiets.cjs`), which are soft, and what a model may and may not do under each.

### P4. Kind of action, and the plan

- The kind (reply, task, calendar hold, file save) is decided by what **closes** the loop: a reply is closed by sending the reply, work by doing it, a promise by its arrival; preparation is not completion. The conventions C-7, C-18 and C-3 encode this and are settled by delegation (2026-11-11), reversible by the owner.
- **Primary and secondary steps.** Some asks deserve a task plus a drafted acknowledgement; let the model propose a primary step and an optional secondary, the person approves one, and score both.
- **Plan and proof.** The Plan object, the steps list and ProofOfClose exist as built, off switches (`ai-product.md` M5); the plan model is evaluated on whether the proposed steps match what the person kept, and the verifier on whether `fetchedBack` is true.

### P5. A data engine from the real distribution

- **Own-use first.** Approve, edit and undo with proof are the cleanest labels there are; an undo is a negative, an edit is right in kind and wrong in detail (path A, B). The on-device export (a switch, no upload) is the missing piece.
- **Synthetic data, but diverse and checked.** Generate with a strong model under constraints (language, sender type, thread shape, phrasing family), de-duplicate, split by template family and thread, and keep a synthetic row only if two readers and the engine agree on a label or the disagreement is adjudicated. Never mix generator ids into labels.
- **Hard negatives and counterfactuals.** For each positive, minimal pairs that remove the ask, change who acts, move the date to the past, or address another person; mine every wrong Do It into the ratchet.
- **Active learning** with one question per day, chosen by teacher-student disagreement and expected value.

### P6. Learning in the wild

- **Closed loop with logs of the decision, not of the mail:** card shown, approved, edited, undone, ignored, proven; these feed labels (P1/P5) and the scoreboard (proof rate, undo rate).
- **Shadow, then canary, then default.** A candidate runs silently on the owner's accounts, then behind an off switch for the owner, then wider; each stage has its own numbers and a one-switch rollback. Offline policy evaluation (counterfactual estimates from logged decisions) screens candidates before any exposure.
- **Per-person calibration on the device (path C):** a few parameters adapt to how this person handled similar mail; the floor never moves.

### P7. Measurement and release engineering

- **Scoreboard v3:** the seven metrics (`model-upgrade-plan.md` section 1) plus slices (language, surface, scenario, sender type, thread length), paired bootstrap for model-against-model comparisons, the sealed-set protocol, and a model card per version (data, labels, conventions, known failures).
- **Pre-registration.** Each experiment states its hypothesis, metric and success threshold before it runs (section 6); a result that was not pre-registered is exploratory and cannot promote a model.
- **The gate stays:** no more wrong Do Its (total and per language), no more wrong actions, fewer misses and not more in either language, on a basis that is not generated by the system under test. When a candidate is held by one row on a small set, report it and test on a larger one rather than loosen the rule.
- **Reproducibility:** pinned environment and dataset hash, one command per table, run records in `V23.md`, one line per decision in `docs/vault/decisions.md`. Usage of the account's limit is a tracked cost of every labelling or baseline pass.

### P8. Privacy and safety

Masked text only for anything that leaves the device, and only behind the approved consent and switch; no raw mail in training logs or in the repository; the private human-text sentences stay gitignored; a model never sends, closes or writes alone; Mail.Send stays unbuilt until the owner's wording changes. Any new data path, scope or permission goes through the owner's «מאשר» and the privacy and store text in the same commit.

## 5. Phases, exit criteria, what blocks

| Phase | What | Exit criterion | Blocked by |
|---|---|---|---|
| A. Truth (now, about 2 weeks) | second-family labeller, two sealed batches, noise-floor estimate, power analysis, content-hash ids for the dataset | a noise-floor number with an interval; sealed sets in place | second model family access, owner time (a small adjudication sample) |
| B. Floor and parity (now, about 2 weeks) | engine parity and defect fixes with corpora (Hebrew reader commitment done), contrast pairs to 100, metamorphic to 10 | 0 hard failures that are not an owner decision; corpora 100% green | none |
| C. Student v3 (about 3 weeks) | multi-task student, abstain head, calibration by language, Hebrew hard cases | beats engine + v2 on the sealed set by the gate, no extra wrong action | none for the CPU experiments; a GPU for a transformer |
| D. Teacher and distillation (about 3 weeks) | reader ensemble labels with spans, student distilled, student against teacher gap | student within the stated gap of the teacher with the cloud off | a GPU host and a spend cap (owner), an API key or a reader service |
| E. Learning from use (about 4 weeks) | device export, own-use labels, shadow and canary, per-person calibration | proof and undo rates on the owner's own use; candidate promoted on owner-verified rows | the extension export (a switch and a decision on how the file leaves the device) |
| F. Compete | public comparison on the sealed set, owner wording | a claim the data supports | a live Gate |

## 6. Twelve pre-registered experiments

| # | Hypothesis | Metric and success threshold | Cost |
|---|---|---|---|
| E1 | Hebrew reader-commitment parity removes 8 of the task-to-draft errors | wrong action drops by at least 6 on the frozen set, no new wrong Do It, corpora green | CPU, minutes |
| E2 | v2.9 labels (C-7, C-18) plus E1 fix the kind of action | wrong action at most the engine-only count; held-out batch confirms | CPU, 10 min |
| E3 | A second reader family agrees with the first on at least 90% of decided rows | agreement with an interval; disagreements adjudicated | usage limit |
| E4 | Owner labels differ from two-Claude agreement by at most 8 points | agreement on a 100-row owner sample | owner time |
| E5 | A boosted stack over structured frames beats logistic regression | missed at least 4 points lower at equal wrong Do It on dev and hold-out | CPU |
| E6 | An abstain head raises selective accuracy | error at 95% coverage at least 20% lower | CPU |
| E7 | Under the engine floor a cloud-class reader keeps wrong Do It within 1.5 points of the engine's | measured on a sealed batch | usage limit or API |
| E8 | A distilled student gets within 5 points of the reader's recall | missed rate gap on the sealed set | GPU |
| E9 | Real own-use labels are cleaner than two-Claude labels | disagreement rate on the same rows | owner export |
| E10 | The engine hard-quiet veto prevents model errors out of sample | at least 20 model errors of the guarded kind in a targeted batch, 0 passed | targeted batch (hedge-heavy) |
| E11 | Content-hash ids make a dataset rebuild leave every label joined | a rebuild test: 100% of frozen texts re-found | CPU |
| E12 | Per-person calibration lowers undo rate | undo rate on the owner's use, before and after | owner use |

## 7. Risks and anti-goals

- **Tuning to the labels.** No label-set row enters training; fixes made after looking at a set are declared; sealed sets are opened once.
- **One-family labels.** Until E3 and E4 are done every claim says "Claude labels"; no comparison to a frontier model is a claim.
- **Moving the target.** Conventions change by a dated decision (delegated or the owner's), not mid-run; the overlay and the pass rules follow in the same commit.
- **Lowering a precision gate to raise recall.** Never. The reader is accepted under the floor, not instead of it.
- **Quota and cost.** Labelling and baselines run through subagents against the account's usage limit; budget them per phase, batch them, and resume after a reset.
- **Silent regressions.** The full corpora run after every engine change (254 corpora, green at the last run); every defect becomes a row in the ratchet.

## 8. What starts now without any approval

Lab only, all behind the existing rules: E1 and E2 verification (the Hebrew fix is in, the full corpora run is under way), the content-hash id change for the dataset (E11), contrast pairs and metamorphic checks growth, a boosted-stack student experiment and an abstain head on CPU (E5, E6), a power analysis of the current sets, and the preparation of the two sealed batches. **Needs the owner:** adjudication and own-use labels (E4, E9), a second-family labeller and a reader key or service (E3, E7), a GPU host and a cap (E8), the device export switch (E9, E12), and any public wording.

## 9. Progress log

- 2026-11-11: plan 2 written. Numbers in section 2 are from the corrected frozen set. E1 measured after the Hebrew reader-commitment fix: engine wrong actions 16 to 12, missed 135 to 125, wrong Do Its 20 to 21 (threshold not met, see section 2); with the fix the engine + v2 / v2.6 / v2.9 read 6.7 / 6.7 / 6.4% wrong Do It, 43.6 / 36.1 / 37.6% missed, 15 / 16 / 17 wrong actions; hold-out (171 rows) v2.9 6.2% and 41.1%.
- **2026-11-11, execution started after the owner's «תתחיל» (phases A and B, the parts that need no outside resource):**
  - **A. Truth.** Sealed batch-009 labelled by two blind Claude passes and not opened (`glance-ai/labeling/sealed/`, README with the opening log); power analysis (`glance-ai/scoreboard/power.cjs`: the frozen set resolves a missed-rate difference of about 12 points and a wrong-Do-It difference of about 5 points; a 2-point claim needs about 2,000 silent rows per arm); stable content ids (`glance-ai/model/dataset/cid.cjs`, in the frozen set and in the dataset build, test passes; the pinned dataset hash changes at the next rebuild). **Not possible yet:** the second-family labeller (no access to another model family from this environment) and the owner's 100-row agreement sample (waiting for the owner).
  - **B. Floor.** The metamorphic check's first "0 flips of 600" was VOID (the edits never reached the engine); corrected and extended to 10 edits. Real findings: doubling the spaces flipped 10.3% of decisions (53 acts went silent), greeting and sign-off flips 4.2% (24 silent to act). **Fixed the space finding** in the shared judge (`prepareForJudge` collapses runs of spaces and tabs) with `test/whitespace-robust-corpus.cjs`; the 62 flips went to 0; all 256 corpora green. Contrast pairs 18 to 34 (23 pass, 7 hard failures, all open or optional conventions: C-1 three times, C-12, C-10, C-7, C-3). **A fix attempted and reverted:** making a Hebrew paid report silent broke `close-families-corpus` (a Hebrew paid report is the designed family-E close, the same C-1 question), so it was not kept.
  - **Greeting dependence (open, not a defect yet):** 24 of 600 mails are silent without a greeting and offered once they open with «Hi Sali»: the engine trusts an addressed mail more. Whether that is the intended precision rule or a recall loss for unaddressed asks is a product decision for the owner.
  - **Owner, same day:** the greeting-dependence item is not substantive; it is a low-priority task, not a question. Recorded in `docs/open-tasks.md`; no decision is needed to continue.

