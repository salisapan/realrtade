# A small open language model on the device, before any external model: the experiment, the rule fixed before any number, and the result (NOT MET, stopped)

> Written 2026-10-04, BEFORE any model was run. Owner's decision (2026-10-04): strengthen the base with free, downloadable open models
> that run inside the extension, ahead of any external model; no integration before a measured comparison against the existing engine
> (same conditions as `docs/encoder-evaluation-plan.md`). Companion to `docs/when-recognition-fails.md` (the chain),
> `docs/local-model-server.md`, `core/local-lm.js` (the tier this would feed).

## 1. The question

`core/local-lm.js` is already the tier that sits behind a `session.prompt(text, schema)`. Chrome's built-in model and the person's own
Ollama / LM Studio are two sources for that session. The question here is a third source: **an open model that ships with, or is
downloaded by, the extension** (WebGPU or WASM in an offscreen document), so that every user has the tier, not just users with the
right Chrome build or an installed server. Would such a model, asked exactly the way the product asks (two differently worded
instructions that must agree, a closed vocabulary, proposals only), add correct proposals on sentences the engine leaves silent, without
costing precision, in Hebrew and in English?

## 2. What is measured, and how (nothing re-implemented)

- `scripts/intent/lm/collect-prompts.cjs` runs the REAL `core/local-lm.js` against a recording session and writes down every prompt the
  shipped code would send (the audit set for the device self-test, and every fixed-corpus sentence the engine is silent on).
- `scripts/intent/lm/generate.py` asks one model every prompt, greedily (temperature 0), prefilled with `{"act": "`.
- `scripts/intent/lm/score.cjs` replays the answers through the REAL parser, two-asking agreement rule, self-test and `propose()`.
- The corpus is the one in `encoder-evaluation-plan.md` §2 (the same `dump-fixed-corpus.cjs`), **without the private human set**
  (it never leaves the owner's machine; the run is on a public GitHub runner).
- Candidates (open weights, no licence gate, ungated on the Hub): `Qwen/Qwen2.5-0.5B-Instruct`, `Qwen/Qwen2.5-1.5B-Instruct`,
  `Qwen/Qwen3-0.6B`, `Qwen/Qwen3-1.7B` (Apache-2.0; to be verified before shipping). **Gemma 3 1B and Llama 3.2 1B were the first
  choices but are gated behind a licence acceptance and a token**, so they are not in this run (said now, not discovered later).

Differences from the product, stated so they are not forgotten: full precision on a CPU instead of 4-bit in a browser (quality here
is, if anything, an upper bound); decoding is not grammar-constrained (an off-vocabulary answer is a null, i.e. silence: it can cost
recall, never precision); the model is not asked for the `when` and `amount` spans (they never decide whether a sentence is proposed);
the engine's "model is sure it is thanks" exclusion is applied as in the product.

## 3. What the corpus can and cannot show (found while preparing, before running)

Computed with a perfect oracle, pooled over blind + te2 + chat:

| | real asks/promises | engine misses | reachable by ANY model under the shipped gates | reachable if the structural shape gate were off |
|---|---|---|---|---|
| English | 145 | 24 | **5** | 15 |
| Hebrew | 128 | 16 | **4** | 6 |

Most of what the engine misses is blocked not by the engine's reading but by the structural gate (`shapedAsk` / `shapedPromise`) that
every proposal needs, and by the tier's own eligibility rules. **Under the shipped gates no model, however good, can add more than 5
(English) or 4 (Hebrew) correct proposals on these sets**, so the encoder experiment's rule "at least 10 more correct proposals" could not have
been met by a perfect model. That is a fact about the gates, not about models, and it is reported whatever the models score.

## 4. The rule (fixed now)

**Primary information (not a gate):** the numbers under the shipped gates, with the ceiling above next to them.

**The deciding question:** would the model be worth a build if it were allowed to speak on engine-silent sentences without the shape gate
(it would then be the only structural check, so adopting this needs the owner's explicit decision; the protection is the measured precision below)?
Per language, on the pooled sets (blind, te2, chat; nothing is tuned on any set; there is no threshold to choose):

- **A** passes the product's own device test (`selfTest`: precision >= 0.97, at least 12 proposals, recall >= 0.4, on the audit set);
- **B1** pooled precision of engine + model stays >= 0.97;
- **B4** at most 1 added wrong proposal per 20 added right ones.

and, where at least 10 misses are reachable without the shape gate (English: 15):

- **B2** pooled recall rises by >= 5 points; **B3** at least 10 more correct proposals;
- **B5** on blind and on te2, added correct proposals and precision not down more than 0.02.

Where fewer than 10 are reachable (Hebrew: 6) the corpus cannot prove a gain, so Hebrew is judged on A, B1, B4 and on capturing at least
60% of the reachable misses (min 3) with none wrong. That earns only **"PROMISING, NOT PROVEN: needs a larger real Hebrew set"**, never "worth a build".

Verdict wording: WORTH A BUILD (all checks pass), PROMISING NOT PROVEN, or NOT MET. Anything but WORTH A BUILD means no integration.
Size and in-browser speed are NOT part of this rule: a CI CPU says nothing about a browser, so they are measured only for a model that earns a build.

## 5. What this experiment does NOT measure

Loop weight, real closure, English on real mail (the human set has 12 English rows), 4-bit quality in a browser, WebGPU speed on weak
laptops, and the 30-60 s a first download takes. A pass here is permission to build and then measure on the owner's real mail.

## 6. Result

### 6a. First run (2026-10-04, GitHub Actions run 37206317874): a defect in the harness, NOT a verdict on any model

All four models failed the device test in both languages and added nothing. For Qwen2.5-0.5B the log shows why: with free-form decoding it
did not keep the schema (`{"act": "pay", "to": "you"}`, `{"act": "test", ...}`), so every one of the 294 answers was rejected by the strict
parser and counted as silence ("0 right, 0 wrong, 28 missed"). The product never decodes this way: its session constrains the keys and the
allowed values (Chrome's `responseConstraint`, Ollama's `format`, a JSON schema). Section 2 had listed "not grammar-constrained" as a difference
that "can only cost recall"; it turned out to cost all of it for small models, so that run measured our harness. I did not inspect the
1.5B and 1.7B answers one by one, so I do not claim their cause. **No rule or threshold was changed.** Only the decoding was fixed
(the model's most likely allowed value per field, in schema order) and checked for plumbing on a random tiny model before the second run.

### 6b. Second run (constrained decoding): all four still proposed almost nothing, and a traced diagnosis found the second harness defect

Qwen2.5-0.5B, Qwen2.5-1.5B, Qwen3-0.6B and Qwen3-1.7B each got 0 or 1 right of ~28 real asks/promises per language on the device test
(Qwen3-1.7B: English 1 right 1 wrong, Hebrew 0 right 1 wrong); no language reached the rule; nothing was added to the engine's proposals.
Because a 1.5B-1.7B instruction model should not be that blind, a short traced run (Qwen2.5-1.5B, first 60 prompts) printed what it
chose and its score per act. Findings: (1) the product's prompt A never names the key `act` (it lists `action`, `who`, `when`, `amount` only), so after
my forced `{"act": "` every act scored about -10 and the pick was close to noise ("ALL PARTNERS MUST SIGN..." read as ACK); (2) on prompt B the
model was confident and mostly right on the act (ASK at -0.03 for "Can IT visit your desk tomorrow morning...") but filled `who` with "me" for
asks and `action` with "send", which the product's two-asking rule (act, action and the right party must all agree) correctly refuses.
Neither is a quality verdict on the model. (1) is the harness not telling the model the schema that constrained decoding enforces.
**This also applies to the product's own Ollama / LM Studio session** (`core/local-lm-server.js` passes the schema as a constraint only): putting the
schema text in the prompt is a pending, separate improvement (open-tasks row 28).

### 6c. Third and LAST run (declared before it ran)

Same models, same prompts, same rule, same scoring; the only change, applied to every model alike, is that the schema text is appended to each prompt.
No further change to the harness, the prompts or the rule is allowed after this run: whatever it gives is the result of this experiment.
(Said now because this is the third attempt; a harness fixed until a model passes would prove nothing.)

**Result (2026-10-04, GitHub Actions run 37217686927): NOT MET in either language, for all four models. Stop; nothing is integrated.**

Device test (the audit set, the product's own bar: precision >= 0.97, at least 12 proposals, recall >= 0.4), right / wrong / missed of ~28 real asks and promises per language:

| Model (4-bit estimate) | English | Hebrew | Median s per call on a CI CPU |
|---|---|---|---|
| Qwen2.5-0.5B-Instruct (~270 MB) | 5 / 21 / 12 (precision 0.19) | 14 / 33 / 1 (precision 0.30) | 2.8 |
| Qwen3-0.6B (~330 MB) | 1 / 1 / 26 | 2 / 2 / 24 | 2.3 |
| Qwen2.5-1.5B-Instruct (~850 MB) | 2 / 0 / 26 | 0 / 0 / 28 | 10.2 |
| Qwen3-1.7B (~950 MB) | 4 / 0 / 24 | 1 / 0 / 27 | 6.3 |

On the fixed corpus (pooled blind + te2 + chat), added correct / added wrong versus the engine alone, under the shipped gates: 0.5B en +2/+2, he +3/+3
(precision falls to 0.969 / 0.958); 1.5B en +2/0, he 0/0; Qwen3-0.6B en +1/0, he 0/0; Qwen3-1.7B en +1/0, he 0/0. The "no shape gate" question gave the same or worse
(0.5B: 7 wrong in each language; the other three the same numbers as above). The ceiling was 5 (en) and 4 (he) under the shipped gates, 15 and 6 without the shape gate.

What this says, and what it does not:
- Models of this size, asked the way the product asks (two wordings that must agree on the act, the action and the right party), are either silent
  (recall 0-14%, precision 1.0 when they do speak) or too eager (0.5B: precision 0.19 in English). No one of them comes near the bar, and Hebrew is no better than English.
- This is not a verdict on every small model. Not tried: models of 3B and up (too large to ship), Gemma and Llama (gated behind a licence token), 4-bit browser quality,
  prompts written for these models rather than for Chrome's built-in one. Tuning the prompts or the agreement rule against these models would be a new experiment with a new rule, and the audit set would no longer be a clean test.
- The first two runs were harness defects (6a, 6b); this run is the one that counts. It was not tuned after the fact.
- On these sets the ceiling is small even for a perfect model; the real mail ceiling is unknown (the owner's 163-sentence Hebrew set was not in a public run).

**Decision: no open model is added to the extension.** The on-device slot stays as built (`core/local-lm.js`: Chrome's built-in model or the person's own Ollama / LM Studio,
each switched on per language only after the same test). Where more recall can come from is a different list: the structural shape gate (15 English and 6 Hebrew misses
sit behind it on these sets) and an external model with consent and a quota (open-tasks row 29), both of which need the owner's decision and their own measurement.
