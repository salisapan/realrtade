# Batch-003: 200 independent labels (Claude), not owner-verified

Glance closes open loops. Gmail is where it starts today.

200 synthetic cases from the v2 test split (`make-batch-003.cjs`: 60 engine blind spots, 60 reference shows, 70 harder silences, 10 easy silences; Hebrew 110, English 90; one case per template; none from batch-001 or batch-002). Claude labelled every case **blind**, from `batch-003.blind.jsonl` (no reference, engine or model answer), at step level, by the product rules: a Do It only for a concrete future action for the person that Glance can do; a reply ask needs a date or a deadline; a meeting needs a day and a time; a save needs a real attachment and the mailbox's own cloud; silence for FYI, thanks, hedges, negations, past or cancelled-without-action, marketing, out-of-office, mail addressed to someone else, and injection. Group greetings and Cc-only asks are `CONTEXT` (a profile feature, CLAUDE.md "Per-user context"). Undated asks are labelled silent and flagged `undatedAsk` (the owner's open decision).

`labeledBy` is `claude` and `ownerVerified` is false on every row. They do not count toward the 200 owner-verified labels the promotion gate needs (`lib.cjs` refuses that): the point of owner labels is a judgment that does not come from a model.

Files: `batch-003.json` (full record), `batch-003.blind.jsonl` (what the labeler saw), `batch-003.claude-labels.jsonl` (the labels), `batch-003.comparison.jsonl` (labels next to every system).

## Results against these labels (187 scored: 101 silent, 86 act; 12 context-dependent and 1 unsure left out)

`tip` is the rules engine of this repository run through the lab teacher (`model/teacher/engine.cjs`) on the clean text; `veto` is the lab's base and product veto (`vb`/`vp`, computed with engine 0.9.35). The lab harness is not the whole browser path (for example the addressed-to-other and Cc hedges of PR #118 are not in it).

| system | wrong Do It | of which undated asks | missed | HE missed | EN missed | wrong action |
|---|---|---|---|---|---|---|
| reference (engine 0.9.35 + overrides, v2's training labels) | 24 / 101 | | 52 / 86 | 36 / 51 | 16 / 35 | 2 |
| engine (tip) + veto | 23 / 101 | 10 | 52 / 86 | 36 / 51 | 16 / 35 | 2 |
| v2 alone | 3 / 101 | 1 | 69 / 86 | 39 / 51 | 30 / 35 | 1 |
| v2.3 alone | 3 / 101 | 1 | 64 / 86 | 32 / 51 | 32 / 35 | 2 |
| engine + veto, then v2 | 24 / 101 | 10 | 48 / 86 | 33 / 51 | 15 / 35 | 2 |
| **engine + veto, then v2.3** | **24 / 101** | **10** | **41 / 86** | **26 / 51** | **15 / 35** | **4** |

On labels that did not come from the engine, v2.3 on top of the engine misses 41 closes instead of 48 (Hebrew 26 instead of 33), with the same wrong Do Its and two more wrong-kind actions.

The reference itself carries errors: 13 of the engine's 23 wrong Do Its are not about undated asks, among them a webinar invitation, an out-of-office reply and a meeting that already happened offered as calendar events (items 65, 95, 97), a thank-you for today's meeting as a calendar event (71), asks addressed by name to someone else (64, 73, 79), a Google Drive save on an Outlook mailbox (93, 100) and a figure due in the past (103). They are listed in `batch-003.comparison.jsonl` for the red team to check on the full browser path.

## Second pass and agreement (2026-10-11)

A separate session labelled the same 200 cases from a prompt that carried only the cases and the labelling rules, on a checkout older than this batch (so it could not read pass 1). `merge-passes.cjs` keeps the cases both passes decided the same way.

| | count |
|---|---|
| agreement labels (`agreement-gold.jsonl`) | 174 (silent 101, draft 32, calendar 21, task 16, file_save 4) |
| disagreements (`agreement-gold.disagree.jsonl`) | 13 (agreement rate 93% of 187 decided by both) |
| left out: CONTEXT in both | 12 |
| left out: one pass unsure | 1 |

Seven of the 13 disagreements are "a confirmed amount or approved budget is a task" (items 2, 62, 74, 85, 87, 92, 105): a product rule (`confirmed-amount|task`) that pass 1 applied and the pass-2 prompt did not state. The next pass should state it. The rest: a promise to answer by a date read as task or draft (1), a cancelled meeting (101, 122), an undated "send me your availability" (112), a callback ask (29) and a save-to-Drive with an attachment (63).

Gate (`promote_gate.cjs`, labels = agreement-gold, 174 rows): in the product order (engine + veto, then the model) v2.3 has the same wrong Do Its as v2 (24 of 101), 37 missed against 44, and 4 wrong actions against 2, so the verdict is HOLD. Alone: 57 missed against 62 but 2 more English misses and 1 more wrong action: HOLD. 174 labels are below the 200 the gate needs, so it could not promote either way. v2 stays the default.

