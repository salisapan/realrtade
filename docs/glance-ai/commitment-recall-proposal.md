# Commitment recall: integration proposal (documentation only)

Glance closes open loops. Gmail is where it starts today. This note proposes how the sent-mail promise reader could be used in the product. It changes nothing: the flag stays off, nothing is wired to the product, nothing is merged by this note. The decision to turn it on is the owner's.

Dated 2026-11-20. Numbers come from `glance-ai/scoreboard/real-mail/commitment-eval.cjs` (counts only, no mail text).

## What exists today

- `FlowFollowUp.classifyCommitment(text, ctx)` (`flow-trial-extension/core/follow-up.js`) reads a sent mail as a promise. The Chrome extension already calls it next to `classifyOutgoing` (`src/follow.js`), so promises already open a "you promised" loop through the lexicon and the on-device model.
- The new behaviour lives behind `ctx.commitmentRecall === true` and is OFF by default. No host passes it. Turning it "on" means a host passes `commitmentRecall: true` in the context of that call.

## What changes when the flag is on

1. Closed-lexicon Hebrew promises the current reader misses: first-person future of a closed verb list («אברר», «אעביר», «נעדכן», …; «אבקש» is excluded because it asks the recipient), and a passive future with a time word («יועבר בהקדם», «יופק עד …»).
2. A conditional veto: a promise sentence that carries «אם» or «במידה» («במידה וצריך … אעביר») is not a promise. «אם כך, …» stays.
3. Nothing else: no new step, no new permission, no new surface, no send. A detected promise opens the same "you promised" loop it opens today, and Undo and ProofOfClose are unchanged.

## Expected effect (measured, evidence layers kept apart)

| Layer | Set | Flag off | Flag on |
|---|---|---|---|
| Claude labels, unverified, tunable | dev2 (17 promises) | precision 76%, recall 76% | precision 88%, recall 88% |
| Claude labels, unverified, tunable | dev3 (27 promises) | precision 78%, recall 52% | precision 85%, recall 85% |
| Claude labels, unverified, tunable | personal-dev (7, mostly QA-style mail) | 86% / 86% | 86% / 86% |
| Held-out, measured only | personal-heldout, 37 sent rows, 1 promise | 1 of 1 predicted, no false | 2 predicted, 1 hit, 1 false |

Owner-verified rows: 0. The owner's approval of the set is general, not row by row.

Honest reading: the dev gain is real but was tuned on those rows. The held-out set has a single promise, so it neither proves nor disproves the gain, and one of the two flagged held-out rows was false. **There is no held-out proof yet.** The only fresh sent rows pulled (50 dev, 16 held-out) held 2 and 0 promises: this mailbox's sent mail is mostly asks and QA-style test mail, not promises.

## Risks

- A false promise opens a "you promised" loop the person did not make. Dev false commitments are 12–15% of predictions (statements of done work, offers). The product's rule is to stay silent when unsure, so this is the main risk.
- Hebrew only: English promises are unchanged.
- The lexicon is closed: a verb outside the list is still missed.
- No effect on the ask metrics, the old frozen sets or the false-offer counts was observed (full regression is in the PR that carries this note).

## Conditions to call it proven (proposed gate, not applied)

1. At least 20 promises in a held-out sent set, labelled by an isolated agent with no code access (and, ideally, row-verified by the owner).
2. Held-out precision at 85% or more and recall above the flag-off recall.
3. Zero new false offers on every ask metric and on the old kind-frozen sets (70/89 and 54/70, 0 false offers).
4. The owner's «מאשר» on the wiring and on any copy that mentions promises.

## Rollback

- The flag is off by default. Rolling back is "the host stops passing `commitmentRecall: true`" (one line per host); nothing else depends on it.
- No data migration: loops opened by a promise are ordinary loops. The person can dismiss them, and Undo leaves an edited item alone.
- A remote kill is possible by reading the flag from a config the host already fetches; this note does not add one.

## Not part of this proposal

Group-mail profile decision, row-level owner verification, and any change to how Glance words promises in copy.
