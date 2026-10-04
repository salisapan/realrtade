# A small open language model on the device, before any external model: the experiment and the rule fixed before any number

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

(not run yet)
