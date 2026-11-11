# For every agent (Grok bot, Cursor, a person): what changed in Glance's own model, 2026-11-11

Glance closes open loops. Gmail is where it starts today.

Read this first, then the pages it points to. Written for an agent that has not seen the session. Everything here is in git on the working branch; nothing is deployed, no switch is on, `manifest.json`, scopes, hosts and public copy are untouched.

## 1. The one thing that changes how you read any model number

**Label ids were positional.** Label files (`glance-ai/labeling/agreement-gold.jsonl`, `batch-NNN.*`) were keyed by dataset row ids like `v2syn-22856`; those ids move when the generator changes, so after the 2026-11-08 rebuild most labelled texts no longer existed and scores joined labels to the wrong text. **Every model number dated 2026-11-08 to 2026-11-11 that is not in `glance-ai/scoreboard/` is withdrawn.** The valid evaluation input is `glance-ai/labeling/frozen-eval.jsonl` (text-bound, 701 rows, built by `glance-ai/model/train/export-frozen.cjs`), scored by `glance-ai/scoreboard/run.cjs`. Content ids: `glance-ai/model/dataset/cid.cjs`.

## 2. Where the numbers are (valid ones)

Frozen set, two-pass agreement labels (Claude's, NOT owner-verified), n = 565, product order with the engine hard quiets as a veto on the model (`glance-ai/model/runtime/hard-quiets.cjs`):

| system | wrong Do It | missed |
|---|---|---|
| engine alone | 7.0% | 47.0% |
| engine + v2 (default) | 6.7% | 43.6% |
| engine + v2.6 / v2.9 / v3.0 | 6.4 to 6.7% | 36 to 38% |
| engine + hard quiets, then a zero-shot strong reader | 7.2% | 2.3% |

Everything is lab only: v2 stays the default, no candidate passed the promotion gate (they are held on the kind of action), nothing is wired. Details and every dated run: `glance-ai/model/V23.md`. The scoreboard and how to run it: `glance-ai/scoreboard/README.md`.

## 3. What was built (all on the working branch)

| Area | What | Where |
|---|---|---|
| Scoreboard | seven metrics, label sources apart, Wilson intervals, engine-only baseline row, hold-out and sealed protocol | `glance-ai/scoreboard/run.cjs`, `power.cjs`, `test-scoreboard.cjs` |
| Frozen label set | text-bound labels, batches 003 to 008 | `glance-ai/labeling/frozen-eval.jsonl`, `export-frozen.cjs` |
| Sealed batch | batch-009, labelled and NOT opened | `glance-ai/labeling/sealed/` |
| Conventions | 18 label conventions with who decided and status | `docs/glance-ai/model-conventions.md` |
| Plans | plan 1 (phases) and plan 2 (ceiling, error budget, 12 experiments) | `docs/glance-ai/model-upgrade-plan.md`, `model-upgrade-plan-2.md` |
| Contrast pairs | 34 minimal pairs EN and HE through the engine | `glance-ai/scoreboard/contrast/` |
| Metamorphic checks | 10 meaning-preserving edits on 600 rows | `glance-ai/scoreboard/metamorphic/` |
| Regression ratchet | 22 engine wrong Do Its frozen | `glance-ai/labeling/ratchet.cjs` |
| Frontier baseline harness | masked prompts, no call; results through `ingest.cjs` | `glance-ai/scoreboard/baseline/` |
| Path A | own-use labels count as owner-verified only with read-back proof; ingest tool; gate hardened | `glance-ai/labeling/lib.cjs`, `ingest-own-use.cjs`, `glance-ai/oss/finetune/promote_gate.cjs` |
| Model experiments | v2.3 to v3.0, frames, stacking, teacher labels (all no gain beyond v2.6) | `glance-ai/model/train/` |

## 4. Engine changes (the only shipped-behaviour changes; each has a corpus; 256 of 256 corpora green)

1. **C-1 option** `ctx.confirmedAmountSilent` in `core/intent.js` (passed through `core/incoming-judge.js`): a mail that only confirms an amount and asks nothing becomes silent. **OFF by default; no host passes it.** `test/confirmed-amount-silent-corpus.cjs`. Making it the default breaks four corpora (the confirmed-amount close is a designed family), so it waits for its own switch.
2. **Hebrew reminder of the reader's own commitment** («סיכמנו שתשלח…», «התחייבת להעביר…», «הבטחת לשלוח…», «לפי מה שאמרת…») is now a commitment (a task), like its English equivalent; before it was read as a reply ask. `core/intent.js` `READER_COMMIT_HE`, `test/hebrew-reader-commit-corpus.cjs`.
3. **Whitespace robustness** in the shared judge: runs of spaces and tabs are one space (doubling spaces flipped 10% of decisions). `core/incoming-judge.js` `prepareForJudge`, `test/whitespace-robust-corpus.cjs`. The Gmail add-on bundle `glance-gmail-addon/CoreBundle.js` was rebuilt from the tree.
4. **Dormant model path** (`core/understanding.js`, off): an ask with no date proposes a draft (owner C-4); a deadline already past stays silent.

## 5. Rules to keep

- Do not train on, copy from or tune against the frozen, hold-out or sealed sets; fixes made after looking at a set are declared.
- Join labels by text or by `cid`, never by a dataset row id.
- Never lower a precision gate to raise recall. A model's answer is a proposal; the device floor (hard quiets, veto, strict gate) has the last word.
- Claims: no "better than a frontier model" anywhere; the labels are Claude's and the baseline is as favoured as it can be.
- Conventions C-7 (an ask for work is a task), C-18 (a reader's undated promise is a task), C-1 plumbing (deferred), C-12 (unchanged) were settled by the owner's delegation («תעשה את מה שהכי יעיל וחכם»), open to his reversal.

## 6. Open, and who can do what

- Needs the owner or an account: a reader service key with a spend cap (the one with the best return), the on-device export of his own decisions (path A), a GPU host.
- Free to pick up: more contrast pairs and metamorphic edits, engine fixes found by the ratchet (each with a corpus and the full corpora run), the greeting-dependence item (low priority, owner 2026-11-11).
- Before you run anything: `scripts/graphify-setup.sh`, then the engine environment variables listed at the top of `glance-ai/model/V23.md`.

## 7. The teacher pipeline (added the same day)

`glance-ai/teacher/` holds the API teacher pipeline: `api.py` (the only place a key is read: the variable `GLANCE_LAB_ANTHROPIC_API_KEY`, never `ANTHROPIC_API_KEY`; metered in `ledger.jsonl`; hard stop at $24), `label.py`, `make-cases.cjs`, `escalate.cjs`, `bootstrap.sh`, and `RUNBOOK.md` (the order: sealed-set baseline, a 200-row cost probe, about 10,000 teacher labels, retrain on CPU, the stop rule). The key lives only in the `glance-model-lab` cloud environment; a session in another environment cannot use it. The teacher labels and evaluates and never goes into the product.

