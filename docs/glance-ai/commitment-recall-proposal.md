# Commitment recall: integration proposal (documentation only)

Glance closes open loops. Gmail is where it starts today. This note proposes how the sent-mail promise reader could be used in the product. It changes nothing: the flag stays off, nothing is wired, nothing is merged by this note, and turning the flag on is not offered here as a way to get proof. Every decision in it is the owner's.

Revision 2, 2026-11-20. Revision 1 proposed a flag and a proof gate; this one aligns the proposal with the contracts that already exist and states the evidence limit as it is. Numbers come from `glance-ai/scoreboard/real-mail/commitment-eval.cjs` (counts only, no mail text).

## 1. What this note builds on (read, not changed)

- **The loop contract on `main`** (`docs/open-loops.md`, "What you promised"; `docs/true-close.md` §7). A promise of yours is already a loop (a watch, `direction: 'mine'`, one loop per thread; a request to someone wins over a promise of yours). It carries "Remind me" and a Task on the day, and it closes only on a message the person sent that really delivers. Another person's reply never closes it, and a second promise is not delivery. ProofOfClose is `{system, externalId, fetchedBack, verifiedAt}`, with remount and Undo.
- **The personal model** (branch `glance-infra/personal-model-s1`: `personal-model/contract.yaml`, `docs/personal-model.md`, `core/personal-model.js`; not merged to `main`). The predicate `work.commitment` already exists in the category `work`. Every category is **off until the person accepts it** on one screen (what is learned, that it stays on this computer, that it can be edited or deleted). A fact write is refused with a reason when the category is off (`consent`), when the object is sensitive, or when a **tombstone** for that predicate, object and address exists. **Forget** writes a one-way tombstone hash, so a forgotten fact is not learned again. Evidence is a pointer (surface, opaque id, time), never the body. An object is a short token of at most 80 characters, never a mail body.
- **The closed-intent ledger** (same branch: `ledger/contract.yaml`, `core/closed-intent-ledger.schema.json`, `docs/closed-intent-ledger.md`). A consented, types-only record: `schemaVersion`, `intentType`, `surface`, `targetSystem`, `outcome` (`closed`, `undone`, `failed`), `confidence` bucket, `latencyMs`, `day`. Off by default, local only, no aggregate sync. A proved close (`fetchedBack`) appends `closed`; an Undo appends a second `undone` row and the first stays.

This note does not touch the other branch's work, does not add a feature that overlaps it, and does not propose editing its schema, its consent screen or its code.

## 2. What the flag changes, and what a recognised promise would be written as

The flag is `ctx.commitmentRecall` on `FlowFollowUp.classifyCommitment` (`core/follow-up.js`): OFF by default, passed by no host today. With it on, the reader recognises more promises (closed-lexicon Hebrew first-person future, a passive future with a time word) and vetoes conditional offers («במידה וצריך … אעביר»; «אם כך, …» stays). It adds no step, no permission, no surface and no send.

A recognised promise would be recorded through the records that already exist, and in no new store:

| Record | Where it already lives | What a promise writes | Gate |
|---|---|---|---|
| The loop | `core/follow-up.js` (a watch, `direction: 'mine'`) | The same loop a promise opens today. Nothing new. | None added: this is today's behaviour. |
| A fact | personal model, predicate `work.commitment`, category `work` | `subject_id` is the owner's own entity; `predicate` is `work.commitment`; `object` is a controlled kind token (`send`, `call`, `meet`, `pay`, `do`), never the sentence; `source` is `inferred`; `confidence`; `evidence` is one pointer `{surface, message_or_event_id, ts}`; `valid_from` is the mail's day, `valid_to` is set when the loop closes; `consent_category` is `work`; the engine's own 30-day half-life applies. | The `work` category is **off until the person accepts it**. `putFact` refuses with `consent` while it is off. |
| A ledger record | closed-intent ledger, schema version 1 | On a proved close only: `outcome: closed` (an Undo appends `undone`; an unproved write appends `failed`). Types only, no text. | The ledger's own Settings opt-in, default off. |

Rules that follow from the contracts:

- **No third-party facts.** `work.commitment` is not in `third_party_predicates` (only six `person.*` predicates are), so the fact is about the owner's own promise. The counterparty is reachable only through the evidence pointer. No role, organisation, habit or place of the other side is stored.
- **No promise text anywhere.** The sentence stays in the mail. The loop keeps its existing short `what` (it already does); the fact and the ledger row hold tokens only.
- **Ledger mapping uses the existing enum.** `intentType` has no `promise` value, so a close maps by kind: `send` → `draft_reply` (target `drafts`), `call` and `meet` → `create_event` (`calendar`), `do` → `create_task` (`tasks` or `todo`), `pay` → `other`. If the owner wants a distinct type, that is a schema revision on the other branch and is out of scope here.
- **Delete.** Forget on the «Glance יודע עליי» card removes the fact and writes a tombstone, so the same promise key is not written again; the ledger's Delete all clears its rows. Turning the flag off stops new writes and deletes nothing.
- **Consent order.** Flag on is necessary and not sufficient. With the flag on and the `work` category off, nothing is written and the product behaves as today. Nothing is uploaded at any step.

## 3. Measured effect (evidence layers kept apart)

| Layer | Set | Flag off | Flag on |
|---|---|---|---|
| Claude labels, unverified, tunable | dev2 (17 promises) | precision 76%, recall 76% | precision 88%, recall 88% |
| Claude labels, unverified, tunable | dev3 (27 promises) | precision 78%, recall 52% | precision 85%, recall 85% |
| Claude labels, unverified, tunable | personal-dev (7 promises, mostly QA-style mail) | 86% / 86% | 86% / 86% |
| Held-out, measured only | personal-heldout (37 sent rows, 1 promise) | 1 of 1 predicted, no false | 2 predicted, 1 hit, 1 false |
| Owner-verified | none | n = 0 | n = 0 |

Reading: the dev gain was tuned on those rows. The held-out set contains one promise, so it neither supports nor contradicts it.

## 4. The proof conditions, stated plainly

**Why held-out proof is not available now.** In the sent mail that was sampled, there are almost no promises: 8 in 109 rows of the first window (most of them QA-style test mail) and 2 in 66 rows of the 12-month window, 0 of them in the held-out part. That is a property of the window and of how it was sampled. It is not a fact about all of the owner's mail, and this note does not claim a promise rate for it.

**The highest evidence layer reachable today:** development evidence on labels made by an isolated labeller (not the owner), which the rules were tuned against; plus a held-out measurement with n = 1 that supports no inference. There is no independent held-out confirmation and no owner-verified row. Nothing in this note upgrades that, and any report that cites these numbers states these two limits next to them.

**What would count as proof in the future** (none of it is met today; the thresholds are not lowered by this note):

1. A held-out sent set, drawn independently of the lexicon being tested (a random draw of sent mail over a longer window or a larger mailbox; never selected by the phrases the reader looks for), with **at least 20 promises**. By the measured rates (about 3% in the 12-month window, and an inflated 7% in the QA-heavy first window), that is on the order of 300 to 700 sent mails; the real rate must be measured, not assumed.
2. Labels from an isolated labeller with no code access, **and row-level verification by the owner** of every promise row and every predicted row in that set. Only rows the owner marked himself may be called verified.
3. Held-out precision of at least 85% with a 95% lower bound (Wilson) of at least 70% on at least 20 predictions, and recall not below the flag-off recall on the same rows.
4. No new false offer on any ask metric, no drop on the old frozen sets (70/89 and 54/70, 0 false offers), and leak-check and the mask check passing.
5. The owner's «מאשר» on the wiring and on any copy that mentions promises.

**A prospective path that is allowed.** A shadow run, flag on, writing nothing, where the owner marks each promise Glance would have recorded (right or wrong) as it appears. Those marks are owner-verified rows and can accumulate toward condition 2. A shadow run without the owner's marks is not evidence, and turning the flag on to see what happens is not a substitute for any of the above.

If the owner wants a condition changed, it is changed in a dated line in `docs/vault/decisions.md` with his word, not here and not silently.

## 5. Risks

- A false promise opens a loop the person did not make. Dev false commitments are 12 to 15% of predictions (statements of done work, offers). The product's rule is to stay silent when unsure, so this is the main risk.
- Hebrew only: English promises are unchanged. The verb list is closed.
- A design question this note does not settle: the personal model merges facts with the same subject, predicate and object (up to 8 evidence pointers), and its tombstone key is predicate + object + the subject's address. With a kind-only object token (`send`), one open fact would stand for every open «send» promise, and Forget would block that kind for good. A finer token that still holds no text (for example the kind plus a coarse day bucket) would avoid it. That is a question for the other branch's contract, so it is listed here and not decided.
- Consent surface: writing `work.commitment` facts depends on the other branch's category screen, which is not on `main`. Until it lands there is nothing to write to, and this proposal adds no storage of its own.
- No effect on the ask metrics, the old frozen sets or the false-offer counts was observed (full regression in the PR that carries this note).

## 6. Rollback

- The flag is off by default; rolling back is the host no longer passing `commitmentRecall: true`. Nothing else depends on it.
- No data migration. Loops are ordinary loops (dismiss, Undo leaves an edited item alone). Facts are removed with Forget (tombstone) and ledger rows with Delete all; the `work` category and the ledger can each be switched off independently.
- A remote kill would be a config the host already fetches; this note adds none.

## 7. Not part of this proposal

The group-mail profile decision, row-level owner verification of the existing set, any change to the other branch (schema, consent screen, code), and any copy that mentions promises.
