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
| engine + v3.1 (10,000 teacher labels mixed with the reference, 2026-11-12) | 6.4% | 36.8% |
| **engine + v3.3 (teacher labels alone, payment-back audit rule, step-confidence floor; 2026-11-12, no spend)** | **6.4%** | **25.6%** |
| engine + hard quiets, then a zero-shot strong reader | 7.2% | 2.3% |

Everything is lab only: v2 stays the default, no candidate passed the promotion gate (they are held on the kind of action; v3.3 by 17 wrong actions vs v2's 15 on the whole frozen set, while on the validation batch 007+008 it has no more wrong Do Its or wrong actions and 30.0% vs 47.8% missed), nothing is wired. Details and every dated run: `glance-ai/model/V23.md`. The scoreboard and how to run it: `glance-ai/scoreboard/README.md`.

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


## 8. 2026-11-12: the plateau was the supervision (no spend)

Training the same small model on the teacher's 10,000 labels ALONE (v3.2) instead of mixing them with the engine-derived reference (v3.1) cut frozen-set misses from 36.8% to 22.6%; the extra wrong actions came from one teacher error (an ask to pay the sender is a draft under `labeling/pass-rules.md`; the teacher's Sonnet escalation made it a task in 302 of 367 rows). v3.3 fixes those labels by the written rule (`model/train/gap-labels-v33.cjs`) and abstains when the chooser is unsure of the step (`train-v2.py --action-target`, chosen on training OOF): 25.6% missed at 19/299 wrong Do Its. Tool: `glance-ai/scoreboard/confusion.cjs`. Full record and the declaration of what was read before each choice: `glance-ai/model/V23.md` (last section). Next lever: teacher labels for the ~15,000 dataset rows not yet labelled (about $3.50), only after the owner's yes in the lab session.

## 9. 2026-11-12: Decompose v1, every intention of a mail (built, off)

`flow-trial-extension/core/intent-decompose.js` (switch `aiDecomposeV1`, default off, no host calls it) splits a mail into clauses, asks the same judge about each, and returns every intention with its parts (who acts, what, for whom, day and clock, money, anchor step, the planner's steps, what really closes it). The whole-mail decision stays first; whole-mail quiets (FYI, hedge, addressee, meeting veto) and phishing stand. Lab (`glance-ai/scoreboard/decompose/run.cjs`): on STITCHED two-intention mails whose parts the engine reads right alone, every intention right 44.7% -> 81.1% (89.3% before the narrowing of section 10). **Stitched mail tests the split, not recognition on a mail written with two intentions; it is not a product quality number.** The frozen set is unchanged (19/299 wrong Do Its) and two missed asks are found. Corpus: `flow-trial-extension/test/intent-decompose-corpus.cjs`. An MLP gate did not beat the linear one. Record: `glance-ai/model/V23.md`.

## 10. 2026-11-12: honest evaluation of Decompose v1 (read before quoting any decomposition number)

`glance-ai/scoreboard/decompose/EVAL-2026-11-12.md`. In short: (1) a natural multi-clause set (`glance-ai/labeling/multi-clause-natural-v0.jsonl`, 33 lab mails, eval only) caught v1 offering a draft on "Could you send the invoice? Please don't."; the clause pass is now narrower (family quiets stand except two clocks; a take-back clause stops it; a second intention needs its own day or clock). (2) With decomposition on, the valid scoreboard is unchanged in wrong Do Its and wrong actions. (3) The lab has no real multi-intent mail, so all-intents-found on real mail is unmeasured. (4) Of 68 remaining frozen misses with v3.3, 40 are recognition and 53 are single-clause; all 19 wrong Do Its are the rules engine's own. (5) Step quality is defined in `glance-ai/scoreboard/decompose/README.md`; only the step and the day have labels today. No spend; the structured teacher run waits on the owner.

## 11. 2026-11-12: first run on the owner's real mailbox

`glance-ai/scoreboard/real-mail/REAL-MAILBOX-2026-11-12.md` (aggregates only; the masked rows are gitignored and never a training row). The lab models add nothing on real mail; the engine missed a client's plain Hebrew questions and offered a reply draft on a Google Calendar notice. Changed: `calendar-notification@` is an automated sender (shipped default); the direct-ask second read is built and OFF (`directAskOn` in `core/incoming-judge.js`, corpus `test/direct-ask-corpus.cjs`). Do not turn it on without the owner's «מאשר». The next measurement is thread-level (the loop, not the single mail).

## 12. 2026-11-12, later: ON by the owner's approval, all surfaces; execution after Do It

The direct-ask reader is ON on Gmail, Outlook and the Gmail add-on (`directAskOn`, off switch: the `directAskOn` flag each host passes; chats are a follow-up). Glance is multi-platform: a change to the shared judge or the shared draft composer is a change on every surface, and every change lists its surfaces. New corpora: `test/execution-coverage-corpus.cjs` (every step a card carries has a writer and an undoer on Gmail, Outlook and chat; the draft is in the language of the ask; the answer frame), `test/follow-real-threads-corpus.cjs` (real outgoing asks open a loop; an opt-out closes it as declined; a Hebrew out-of-office holds it). Details and the surface table: `glance-ai/scoreboard/real-mail/REAL-MAILBOX-2026-11-12.md` section 6.
