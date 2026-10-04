# Encoder as a fallback: the experiment, and the rule fixed before any number

> Written 2026-10-04, BEFORE the experiment ran, at the owner's conditions: no integration before a measured comparison against the
> existing engine; the goal is better intent recognition / loop handling / real closure in Hebrew AND English; the model must be small,
> local, no text leaves the device; it may only REINFORCE or serve as a FALLBACK, never replace the judgment layer; no clear
> improvement means stop. Companion to `docs/ai-engine-upgrade.md` §4 (the earlier encoder question) and `docs/intent-model.md`.

**Status when written: not run.** The sandbox's network policy refuses `huggingface.co`. The owner approved the host but could not change
the environment's settings (iPhone), so the run was done on GitHub's own runner instead (`.github/workflows/encoder-experiment.yml`),
on the PUBLIC fixed corpus only. Result: section 6.

## 1. The question

When the shipped engine (lexicon + learned model + structural gates, `core/intent-pipeline.js`) is SILENT on a sentence, would a small
multilingual encoder with a linear head have been right to speak, without costing precision? The encoder is frozen (no fine-tuning). Only
a 4-way softmax head (ask, promise, statement, thanks) is trained, on the same training sentences the shipped model learned from.
The fallback never overrides the engine, and must pass the same structural gate (`shapedAsk` / `shapedPromise`) the engine's own model
tier needs. In strict-register chat sentences the bar is p >= 0.9 (the chat rule: stricter than Gmail).

Candidate: `intfloat/multilingual-e5-small` through its ONNX export (`Xenova/multilingual-e5-small`, int8), run with ONNX Runtime, the same
runtime that would ship (ONNX Runtime Web, WASM). A second candidate is tried only if the first narrowly misses on a single check.

## 2. The fixed corpus (nothing is added or removed after the first run)

`node scripts/intent/dump-fixed-corpus.cjs <dir>` writes it. 977 sentences, English and Hebrew:

| Set | n (en / he) | Written by | Role |
|---|---|---|---|
| dev (odd rows of `intent-gold`) | 55 / 41 | hand | **The only set used to choose the threshold** |
| blind | 65 / 43 | hand, varied domains | pooled, judged |
| te (teacher eval) | 138 / 140 | a model | reported, not pooled (earlier rounds saw it) |
| te2 (teacher eval 2) | 122 / 121 | a model | pooled, judged |
| chat-gold | 41 / 36 | model-written chat register | pooled, judged (strict mode) |
| human | 12 / 163 | the owner's real sent mail, masked, labels assigned by a model and unchecked | pooled, judged; **local only, never committed**; English coverage is very thin |

Reply task (secondary, closure): the 126 sentences of `scripts/reply/replies-eval.json` + `replies-eval2.json`, with the shipped reply
model's class probabilities (`dump-fixed-corpus.cjs` writes `replies.json`).

## 3. The rule (fixed now; computed by `scripts/intent/nn/encoder-fallback-eval.py`)

The threshold T is the lowest p (0.50 to 0.99) at which the fallback keeps precision >= 0.97 on dev. Then, over the pooled judged sets
(blind, te2, chat, human), separately for English and for Hebrew:

1. pooled precision of engine + encoder stays >= 0.97;
2. pooled recall rises by at least 5 points;
3. at least 10 more correct proposals than the engine alone;
4. at most 1 added wrong proposal per 20 added correct ones;
5. on blind and on te2, each language shows added correct proposals and precision not down more than 0.02;
6. latency <= 60 ms per sentence (batch 1, 2 threads, this machine's CPU);
7. size <= 30 MB after int8 and pruning the vocabulary to the tokens Hebrew and English need (the unpruned file is reported; pruning is a
   separate, later, mechanical step and is only attempted if 1-6 pass).

**Any single failure means STOP: no integration, no further work on this model.** Meeting the rule means "worth a build", not "ship":
an integration would still need the extension packaging, a CSP change, the privacy page, and the same corpus gates the engine has.

The reply task is reported, not gating: the encoder head would have to match the shipped reply model's precision on "not an answer"
(0.956) while holding open at least 10 points more of the true non-answers, with no more real answers held open, to be worth a second look.

## 4. What this experiment does NOT measure (said now so it cannot be forgotten later)

- **Loop weight** (how much a loop matters: money, deadline, person): this is computed from structure (`intentionWeight`), there are no
  labelled sentences for it, and an encoder trained on nothing cannot be judged on it. Not tested.
- **Real closure** beyond the reply task: whether a loop was truly closed needs real threads; there is no fixed corpus of them.
- **English on real mail**: the human set has 12 English rows. An English gain on model-written sentences would not show how the encoder
  behaves on real English mail.
- Model-written sets measure how the models read model-written language. A pass is permission to build and then measure on real mail.

## 5. What the owner has to do to let it run

Environment settings -> Network access -> Custom -> Allowed domains: `huggingface.co`, `cdn-lfs.huggingface.co`,
`cas-bridge.xethub.hf.co` (the weights are served from the last two). Keep the default package-manager list. If the session was
already running when the change was saved, start a new session on the same branch: the policy is applied when the environment starts.

## 6. Result (2026-10-04, GitHub Actions run 37195398708): the rule is NOT met. Stop.

Model `Xenova/multilingual-e5-small` (int8 ONNX, the quantised export, **118 MB unpruned**), frozen encoder + 4-way head, threshold chosen on
dev only (it came out at the grid minimum, 0.50: dev has 96 sentences and could not discriminate). Latency 4 ms per sentence (batch 1,
2 threads, a CI runner). The private human set was NOT in this run (it never leaves the owner's machine), so pooled = blind, te2, chat.

Engine alone -> engine + encoder as fallback (silent sentences only), pooled:

| | precision | recall | added right | added wrong |
|---|---|---|---|---|
| English (n=228) | 0.984 -> 0.985 | 0.834 -> 0.883 (+4.9) | +7 | 0 |
| Hebrew (n=200) | 0.982 -> 0.984 | 0.875 -> 0.938 (+6.3) | +8 | 0 |

By set: te2 en +6 / he +8 right, 0 wrong; blind en +1 / he 0; chat 0 / 0; dev en +2 / he +0 (+1 wrong). Reply task: the encoder head held open
24 non-answers at precision 1.0 (0 real answers held open) against the shipped reply model's 45 at 0.956 (2 held open): less coverage, not more.

Rule, line by line: precision >= 0.97 PASS (both); recall gain >= +5 points en FAIL (4.9), he PASS (6.3); at least 10 more right proposals FAIL
in both (7 and 8); at most 1 wrong per 20 right PASS (0 wrong); blind shows no gain in Hebrew FAIL; te2 PASS; latency PASS; size not
attempted (118 MB against 30 MB needs vocabulary pruning, which the plan only does if everything else passes).

**Decision: do not integrate, do not tune the rule.** Reading it fairly: the encoder added a small number of correct proposals and no wrong ones,
nearly all of them on the model-written te2 set, and the gain is within what 7 or 8 sentences on a set of 200 can be by chance. It is
a hint, not evidence. The bar existed to stop us building on a hint; lowering it after seeing the result would defeat the point.
What would change the answer is not a different threshold but a different test: a large set of REAL sentences in both languages (the owner's
labelled human set grown past a few hundred, with the labels checked), measured the same way. If that is ever built, this plan and script
are the harness.

Not tested, and still not: loop weight (no labels) and closure on real threads.
