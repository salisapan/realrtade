# Glance's own model: the upgrade plan (from a lab classifier to the best intent-closing model)

Glance closes open loops. Gmail is where it starts today.

**Status of this page.** Plan, written 2026-11-11 at the owner's request («אני רוצה שזה יהיה מודל AI הכי טוב בעולם»). It changes no code, wires no model, turns no switch on, and touches no privacy text. Everything it proposes stays behind the existing rules: a model's answer is a proposal that cites its evidence, never closes, writes or sends alone; the device floor (hard quiets, veto, strict gate) keeps the last word; a feature still works, more quietly, with the model off (`docs/local-first-principle.md`, `docs/glance-ai/ai-product.md`).

## בעברית, בקצרה

1. **"הכי טוב בעולם" בהגדרה צרה ומדידה:** לא מודל כללי. המטרה: המודל שסוגר הכי טוב כוונות פתוחות במייל ובצ'אט, בעברית ובאנגלית, עם הכי מעט פעולות שגויות, ועם הוכחה שהסגירה קרתה. את התואר "הכי טוב" אפשר לטעון בפומבי רק אחרי Gate חי (CLAUDE.md: טקסט ציבורי טוען רק מה שעבר Gate), ורק מול מודלים כלליים שנמדדו על אותו סט.
2. **החסם האמיתי הוא לא עוד אימון, אלא אמת מדידה.** היום: 0 תוויות מאומתות על ידך, התוויות של Claude, התווית המקורית של הדאטהסט היא המנוע עצמו (תקרה: להעתיק אותו), והדאטה סינתטי. לכן שלב 0 הוא תשתית אמת, ואחריו ארכיטקטורה.
3. **שלוש קפיצות:** (א) אמת: תוויות מהשימוש שלך עם הוכחת סגירה (נתיב A שכבר אושר), סט אמת נעול, והשוואה מול מודלי חזית. (ב) מודל חכם יותר: מודל קטן על המכשיר שמבין מבנה (מי מתחייב, מי מתבקש, איזה תאריך), מזוקק ממודל ענן מכוון (Qwen3.5-4B עם LoRA), עם יכולת לשתוק כשלא בטוח. (ג) לולאת למידה: כל אישור, עריכה, ביטול או סגירה מוכחת הופכים לתווית, בלי לשלוח מייל מהמכשיר.
4. **מה אני יכול להתחיל מיד בלי אישור חדש** (מעבדה בלבד) וצעדים שדורשים «מאשר» שלך: בסוף המסמך, סעיף 9.

## 1. What "best in the world" means here (and what it does not)

Glance's model is not a general assistant and will not be judged as one. The claim we can earn is narrow and checkable:

> On real mail and chat, in Hebrew and English, Glance's model finds the intention that needs a close, plans the close, and stays silent when unsure, with fewer wrong Do Its and more proven closes than any model we can compare it with on the same cases.

"Best" is a scoreboard, not a sentence. Seven numbers, always reported by label source (owner-verified, two-pass agreement, spec) with n, and Hebrew and English apart:

| # | Metric | Why it is the product | Today |
|---|---|---|---|
| 1 | **Wrong Do It rate** (acted where the right answer is silence) | silence beats a wrong Do It; this is the trust floor | v2.6 product order: 26 / 161 silent rows on agreement labels, 4 / 36 on batch-006; v2 test split about 0.2% to 0.5% across runs (synthetic) |
| 2 | **Close recall** (missed closes, by language) | the value: a loop that should have been offered | v2.6: 26 / 69 missed on agreement labels (HE 13 / 26, EN 13 / 43) |
| 3 | **Wrong action** (a Do It of the wrong kind) | a task where a reply was needed is still a defect | 7 / 230 |
| 4 | **Proof rate** (offered closes that reach ProofOfClose with `fetchedBack`) | we sell the close, proven | not measured on real use yet |
| 5 | **Calibration and abstention** (does "unsure" mean unsure) | Zero-Prompt and silence | tau rule only; no calibration report |
| 6 | **Hebrew parity** (HE minus EN gap on 1 to 3) | first user is an Israeli freelancer | HE and EN reported apart, no parity target |
| 7 | **Cost and latency** (device ms, cloud $ per close) | Free must stay useful; spend capped | device ms measured in lab; cloud unmeasured (M6) |

Public wording about any of this follows the standing rule: only what passed a live Gate, and "with proof it was done" only where a read-back exists. No "best AI in the world" on any surface until a comparison on the owner-verified set supports it.

## 2. Where we are, from the repository (not from hope)

- **Tier 0 on the device (shipping):** rules engine plus lexicons plus the v2 small model (a gate and a chooser, both logistic regressions over sparse features, int8, JS runtime). In the product order the engine and veto act first; the model acts only where the engine is silent (`glance-ai/model/V23.md`).
- **Lab candidates:** v2.3 and v2.6 (gap labels, "asap" not a date, approximate amounts silent, Hebrew «צריך לשלם»). v2.6 passes `promote_gate.cjs` on 230 two-pass agreement labels (26 wrong Do It against 29, 26 missed against 34 and 31). It is the lab's best so far; the default is v2; nothing is wired.
- **Cloud model (parked):** Qwen3.5-4B, LoRA, Understanding contract and validator built, `promote_gate.cjs` built, GPU run parked until 200 owner-verified labels and the spend approval (cap under $50, host approved 2026-10-14, not rented).
- **Learning from use (approved 2026-10-13, paths A to D):** the plan exists (`docs/glance-ai/learning-from-use.md`); path A's reviewed PR to count own-use labels is the first dependency.
- **Real-mail evidence:** 22 masked owner sentences (`flow-trial-extension/test/fixtures/real-mail-gold.json`), 0 owner-verified labels of the 200 needed.

### The six ceilings the 2026-11 runs exposed

1. **The reference is the engine.** The dataset label for most rows is the 0.9.35 rules engine, so a model trained on it can at best copy it. Gap labels from template intent (v2.3 to v2.7) taught the recall gap, and v2.7 showed that adding more rows of that kind changes nothing: the remaining misses are not a data-balance problem.
2. **The remaining misses are feature-limited.** A linear model over sparse features cannot separate "as promised on the call, you will share the lease today" (a promise by the reader) from a statement. It needs structure: who commits, who is asked, which date, which direction.
3. **Ground truth is Claude's, not ours.** 444 agreement labels, two Claude passes, rising agreement (93, 97.8, 100%) because the pass-2 prompt now states settled conventions. That makes the passes less independent. Both can share a blind spot.
4. **The data is synthetic.** Test-split numbers measure generalisation to unseen templates of the same generator, not real mail. Real-mail evidence is 22 sentences.
5. **Conventions are still being decided case by case** («לפני החג» was decided today). Each undecided convention caps the gate's meaning.
6. **No learning loop yet.** Approve, edit, undo and fetched-back proof exist as events in the product but do not yet flow back as labels.

## 3. Target architecture

One Understanding contract, four tiers, one rule: the device floor decides what may be shown.

```
                       ┌────────────── teacher side (offline, lab) ──────────────┐
                       │ frontier LLM teacher + owner/own-use labels + outcomes  │
                       │   → spans, intent, plan, hard negatives                  │
                       └───────────────┬─────────────────────────────────────────┘
                                       │ distillation + preference tuning
Tier 0  device, always, $0, ms    rules + v3 small multi-task model ──► clear cases, quiets, silence
Tier 1  device LM when present    short extraction (dates, who, ask sentence) ──► Understanding
Tier 2  Glance cloud, masked      Qwen3.5-4B fine-tuned: Understanding + Plan, strict JSON
Tier 3  verifier (read-back)      did the close really happen? ProofOfClose, undo-safe
                                       │
              device floor: hard quiets · veto · strict gate · date reader wins · needs a click
```

Design rules that do not move: device first, then Glance's model (`docs/local-first-principle.md`); a model's answer cites spans from the masked text and a field with no span is dropped; dates come from the device parser, not from the model; the model may hold a loop open or propose, never close, write or send.

## 4. Workstreams

### W1. Ground truth and the scoreboard (first, because everything else is measured by it)

- **Owner-verified labels without hand labelling.** Build path A's reviewed PR (own-use decisions with the connector's read-back become `ownerVerified` rows) so `promote_gate.cjs` can use them. Target: 200 rows, then 1,000.
- **A frozen real-mail test set.** Masked, bilingual, received and sent mail, a second person's mail, never trained on, every fix made after looking at it declared in the file (`docs/human-eval.md` §6). Two parts: a public-shape part checked in, a private part never committed.
- **A comparison harness against frontier models.** The same cases, the same masked text, three prompts (zero-shot, the Understanding prompt, few-shot), scored by `promote_gate.cjs`. This is the only way "better than the others" ever becomes a sentence. Cached predictions only; no paid call without the owner's key and cap.
- **Report by label source.** Spec, agreement, owner-verified, own-use, with n and HE/EN apart (already the rule).
- **Settle conventions in one table.** One document of decided conventions (undated asks, holiday dates, Cc, group mail, "approx" amounts, promise by reader versus statement), each with an owner decision date, so a label can cite it. Today they live in batch files.
- **Exit criterion:** a scoreboard run produces all seven metrics from one command, on a label basis that is not generated by the system under test.

### W2. The data engine (from templates to the real distribution)

1. **Teacher distillation with spans.** A strong teacher labels masked mail with the Understanding contract (`ask_span`, `evidence_span`, `due_span`, direction, state) on consented own-use mail and on public or synthetic corpora; every label cites a span; disagreement with the device parser is flagged, never trained in (the SFT v2 audit found 43% of act rows disagreeing with the device on dates).
2. **Hard-negative mining.** The expensive errors are silent-by-design cases that look like asks: newsletters, receipts, "no need to reply", status updates, Cc-only, approximate amounts, historical statements. Mine them from the engine's own quiets and from every wrong Do It in the logs.
3. **Contrast pairs.** Minimal pairs that differ in one fact (who commits, date present, past versus future, To versus Cc), used as both training data and a frozen test (`profile/` contrast-heldout style), so improvements are causal, not lucky.
4. **Adversarial generation (red team).** A generator tries to produce a wrong Do It against the current model and floor; every success becomes a regression row.
5. **Hebrew depth.** Morphology (plural imperative «תסרקו ותשלחו», «אפשר לאשר», future-as-request), mixed-language mail (follow up, approve, PO inside Hebrew), RTL and masking artifacts, holiday-relative and Hebrew-calendar dates.
6. **Active learning with the one question.** Ask the person at most one question per day on the row with the highest model disagreement (existing "one active question" design); answers become own-use labels.
7. **Outcome labels.** A close with `fetchedBack: true` is a positive; an Undo, a deliberate release, or a card dismissed without action is a negative or unsure, by the rules in `docs/true-close.md`.
8. **Dataset governance.** Pinned sha256, versioned dataset cards, train, val and test split by thread and by template family (not by row), so a template cannot leak across splits.

### W3. The model itself

**Phase A (weeks, lab): a better small model on the device.**
- Replace "bag of features and two logistic regressions" with a **small multi-task model over structure**: one shared encoder, heads for relevance, intent kind, direction (who must act), date presence, and an abstain head. Keep the existing hand features as inputs (rules are signal, not rivals).
- Start with a **gradient-boosted or small MLP stack over structured frames** (fast to ship, runs in the current JS int8 runtime, parity-checked), then a **distilled multilingual transformer** in the 20 to 60M parameter range, int8, run with ONNX or WebGPU where the browser allows, only if it beats the stack on the real-mail set. Choose by the scoreboard, not by fashion.
- **Calibrated abstention.** Temperature scaling plus conformal thresholds per language and per intent kind, so tau means a stated wrong-Do-It rate instead of a global number; report calibration error.
- **Per-user calibration on the device** (path C): a few parameters adapt to how this person handled similar mail; the floor is unchanged; nothing leaves the device.

**Phase B (the owner's GPU approval): the cloud model.**
- Qwen3.5-4B LoRA on SFT v3 (grounded Understanding targets, repaired dates), one run under the cap, scored by `promote_gate.cjs` against the best device model and against the frontier baselines.
- **Preference tuning** on closing plans that really finished (path B): kept steps are positives, removed steps negatives, edits are the target. Hold-out: the newest decisions are never used in the run that labels them.
- **Distill the cloud model into the device model.** The cloud model is the teacher for Tier 0 and Tier 1; the device keeps working with the cloud off.

**Phase C: the plan and the proof.**
- **Plan model:** from the Understanding, propose the steps (task, calendar hold, draft, file save) with the target system and the "done when" condition; the steps list renders it; every step needs a click.
- **Verifier:** a read-back check that says whether the close happened (ProofOfClose) and refuses to count preparation as completion.
- **Selective prediction:** the model may say "hold open" or "ask one question", never "close".

### W4. Dates, numbers and structure (deterministic where it should be)

The device parser stays the authority on dates (`core/extract.js`). Planned work, each with a corpus before it ships: holiday-relative dates («לפני החג»: decided 2026-11-11 as a task, the engine does not yet resolve it), "end of week" and «סוף השבוע» as one rule for both languages, Hebrew weekdays and "next weekday", dd/mm versus mm/dd by language (already fixed for Hebrew), approximate amounts as non-confirmed, and Hebrew and English number and currency forms.

### W5. Personalization and relevance

M8 of `ai-product.md`: the profile (role, history, work style) feeds the Understanding's `relevant` field. Group and Cc mail are decided by relevance, `unknown` keeps today's behaviour, and no product quiet is removed before a contrast-pair shadow test passes.

### W6. Promotion discipline and safety

- **Shadow, then canary, then default.** Every candidate runs in shadow with no user-visible effect, then behind an off switch for the owner's own accounts, then wider, each stage with its own numbers.
- **Never lower a precision gate to raise recall** (standing rule). The gate stays: no more wrong Do Its (total, HE, EN), no more wrong actions, fewer misses in total and not more in either language, on a basis that is not generated by the system under test.
- **A regression ratchet.** Every wrong Do It found anywhere becomes a frozen row; the suite only grows.
- **Rollback is a switch.** Each model version has an off switch and the previous version stays installable.
- **Privacy.** Nothing new leaves the device until the approved copy ships with the switch (approved 2026-10-14, goes live only with a Netlify «מאשר»). Masked text only; no raw mail in training logs; the private human-text sentences stay gitignored.

### W7. Infrastructure and cost

- **Compute.** CPU for the small models (about 5 minutes per retrain today); one GPU run for LoRA under the approved cap; no standing rental.
- **Eval cost control.** Cached predictions, one frozen run per candidate, frontier-baseline calls only with an owner key and a stated cap.
- **Reproducibility.** Pinned environment variables and dataset hash (already pinned), a single "run all" script that prints the scoreboard, results written to `V23.md`-style run records and one line in `docs/vault/decisions.md`.

## 5. Phases, exit criteria and targets

Durations are estimates to be reset after Phase 0. Targets are proposals; the owner sets the final numbers, and none is a public claim.

| Phase | What | Exit criterion |
|---|---|---|
| **0. Ground truth** (about 2 weeks) | path A PR, frozen real-mail set, one-command scoreboard, conventions table, frontier-baseline harness (cached) | the seven metrics from one command on a basis not generated by the system under test; first numbers for frontier models on our cases |
| **1. Better small model** (about 3 to 4 weeks) | structured multi-task model, calibrated abstention, contrast-pair suite, red-team generator, Hebrew depth | beats v2.6 on the gate on the owner-verified set; calibration error reported; wrong-Do-It rate at or below the stated target; JS runtime parity 99.9% |
| **2. Cloud model** (needs the GPU approval; about 2 weeks) | SFT v3 LoRA, one run under the cap, gate against device and frontier baselines | passes `promote_gate.cjs` on owner-verified rows; latency and cost per close measured (M6) |
| **3. Distill and personalize** (about 3 weeks) | cloud teacher into Tier 0 and Tier 1, path C on-device calibration, relevance from the profile | device model within a stated gap of the cloud model on the real-mail set with the cloud off |
| **4. Plan and proof** (about 4 weeks, with the steps-list UI) | plan model, verifier, preference tuning on finished plans | proof rate measured on real use; no step runs without a click; Undo leaves an edited artifact alone |
| **5. Compete** | public comparison on a frozen set, only after a live Gate | a claim the data supports, worded by the owner |

Proposed numeric targets for the end of Phase 3, on the owner-verified real-mail set: wrong Do It at most 1 in 100 silent mails (today's lab number on spec labels is about 1 in 6 on the agreement set, so this is the hard part); missed closes at most 25% (today 38% on agreement labels); Hebrew missed within 5 points of English; expected calibration error under 0.05; device p95 under 50 ms for Tier 0. These are goals to be tested against real data, not expectations.

## 6. What would make a model "the best", ranked by leverage

1. **Better ground truth** (owner-verified, outcome-labelled, real mail). Without it every other gain is unmeasured.
2. **Structure, not more rows** (who acts, which date, which direction). The v2.7 run is the evidence.
3. **Calibrated silence.** Our edge is trust: knowing when not to act.
4. **A teacher stronger than the student** (cloud model, then distillation to the device).
5. **Learning from real closes** (paths A to C), because competitors cannot see ProofOfClose.
6. **Hebrew depth.** The first user and the weakest slice of the data.
7. **Speed and privacy by construction** (device first).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Labels drift toward the labeller's own habits (two Claude passes) | owner-verified and own-use labels as the promotion basis; label source always reported |
| Overfitting to the blind sets by tuning | never copy label-set rows into training; fixes made after looking are declared; frozen private set |
| A stronger model raises wrong Do Its | the floor is deterministic and last; gate forbids more wrong Do Its |
| Synthetic-to-real gap | real-mail set, teacher distillation on consented mail, outcome labels |
| Cost of cloud calls | caps, cached evaluation, allowance model from measured numbers (M6) |
| Privacy regression | masked text only, approved copy ships with the switch, off by default, no raw mail in logs |
| Hebrew regression | HE and EN gated apart; Hebrew contrast pairs |
| "Best in the world" claimed too early | claims policy: live Gate first, comparison on the same cases, owner wording |

## 8. Dependencies already in the repository

`glance-ai/model/` (v2 family, gap labels, `compare-v2n.py`, `V23.md` run records), `glance-ai/labeling/` (batches, agreement gold, `gate-inputs.cjs`, `score-batches.cjs`), `glance-ai/oss/finetune/` (SFT v3 builder, `promote_gate.cjs`, GPU runbook), `flow-trial-extension/core/understanding.js` (validator), `docs/glance-ai/ai-product.md` (tiers and milestones M1 to M8), `docs/glance-ai/learning-from-use.md` (paths A to D), `docs/true-close.md` and `docs/reply-model.md`.

## 9. What starts now and what waits for the owner

**Can start immediately, lab only, no approval needed (all behind the existing rules):**
- the conventions table (W1) from decisions already recorded;
- the one-command scoreboard and the frozen real-mail test set structure (W1);
- the frontier-baseline harness using cached predictions (W1);
- hard-negative mining and the red-team generator (W2);
- the structured small-model experiment and calibrated abstention on CPU (W3 Phase A);
- holiday-relative date rule written as a corpus first (W4).

**Waits for the owner's «מאשר»:**
1. Wiring v2.6 behind an off switch for the owner's own accounts (no switch turned on without the owner).
2. The GPU run (cap under $50, host approved 2026-10-14, not rented).
3. Frontier-baseline calls with real keys and a spend cap.
4. Teacher labelling on the owner's own mail (consent and masking rules first).
5. Any change to privacy or store text, `manifest.json` permissions, hosts or scopes.
6. Public wording of any comparison.

Recommended first step: **Phase 0, one command that prints the seven numbers on a basis we trust.** Every later claim, including "the best", depends on it.

## 10. Progress log

- **2026-11-11, Phase 0 started (lab, no approval needed).** Built: `glance-ai/scoreboard/run.cjs` (the seven metrics, label sources apart, Wilson intervals, engine-only baseline row, calibration), the frontier-baseline harness (`baseline/make-prompts.cjs` and `ingest.cjs`, no model call, prompts masked), the frozen real-mail set structure (`real-mail/README.md`, `private/` gitignored) and the conventions table (`docs/glance-ai/model-conventions.md`, C-1 to C-17). **First finding, which changes Phase 1:** on the agreement labels the engine alone makes 26 wrong Do Its of 161 silent rows; v2.6 adds none and cuts misses from 35 to 26. Half of the 26 are undated asks (C-4, open owner decision); the other half are engine reads of real sentences, for example a confirmed amount read as a task (C-1). So the "wrong Do It at most 1 in 100" target in §5 is mostly an engine and convention problem, not a small-model problem. Still open in Phase 0: path A's reviewed PR (owner-verified labels), real rows in the frozen set, the actual frontier runs (need a key and a cap).

