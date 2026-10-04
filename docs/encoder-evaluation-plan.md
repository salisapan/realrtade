# Encoder as a fallback: the experiment, and the rule fixed before any number

> Written 2026-10-04, BEFORE the experiment ran, at the owner's conditions: no integration before a measured comparison against the
> existing engine; the goal is better intent recognition / loop handling / real closure in Hebrew AND English; the model must be small,
> local, no text leaves the device; it may only REINFORCE or serve as a FALLBACK, never replace the judgment layer; no clear
> improvement means stop. Companion to `docs/ai-engine-upgrade.md` §4 (the earlier encoder question) and `docs/intent-model.md`.

**Status when written: not run.** The sandbox's network policy refuses `huggingface.co`; the owner approved the host and it must be
allowed in the environment settings (see the end). Everything below is ready so the run takes minutes.

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
