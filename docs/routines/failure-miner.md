# Failure miner

Glance closes open loops. Gmail is where it starts today. This log is implementation status: what the intent ranker missed on the eval set, and what this run changed.

## 2026-10-14

Set: `glance-ai/oss/eval/eval.jsonl`, 275 rows, judged with the current engine and the set's own now (`2026-10-07`). Outbound mail stays silent, the same host rule as the teacher. Commitment and promise rows were not candidates (held until the commitment-detection PR is merged). No live undo or edit ledger is in the repo; the synthetic profile rows are not this ranker.

Misses before, excluding promises: Hebrew construct-state team meetings (`פגישת צוות` + day + clock) 5; English "please reply" with no To/Cc on the case 4; Hebrew approve-yes kept silent on purpose 3; Hebrew "אפשר את האישור שלך" 3; OneDrive named on Gmail 3; two single rows. The construct form was the largest cause that is a ranker bug: `פגישה` already filed the meeting, `פגישת` did not.

| | before | after |
|---|---|---|
| Those 5 team meetings shown | 0/5 | 5/5 |
| Misses on the 275 | 25 | 20 |
| Wrong Do It | 7/167 | 7/167 (same seven ids; this change added none) |

Code: `flow-trial-extension/core/intent.js` (`MEETING_NOUN_HE`, thanks-for-the-meeting recap). Test: `flow-trial-extension/test/meeting-construct-corpus.cjs`.

## 2026-10-17

Set: `glance-ai/oss/eval/eval.jsonl`, 275 rows, judged with the integration tip (0.9.56 bundle) through `glance-ai/oss/eval/teacher.cjs`, the set's own now (`2026-10-07`), the person named `Sali` / `סאלי` and the name wait done (the host rule since 0.9.56: a greeting with no cached name is held, not judged). Outbound mail stays silent. Commitment and promise detection were not touched. No live undo or edit ledger is in the repo.

Cause, by size: 38 misses on 108 rows that should act. The largest cluster was not a phrase. The judge read `i.now` with `instanceof Date`. A Date built in another realm (the eval's vm sandbox, an iframe) fails that test, so the judge fell back to the real clock. Every mail dated after the set's `2026-10-07` but before the machine's clock then read as a past date and went silent, and a date a year ahead of the passed clock was rolled to the next year. 16 of the 38 misses were that: 10 meeting holds ("Let's meet on October 14 at 3pm", "Can we do a call ... ?"), 2 Hebrew meeting dates, 4 English "We will send ... by October 14" promise rows (recovered as a side effect; no commitment file changed).

Left on purpose, not changed: Hebrew "תוכל לאשר" / "נא לאשר" is the reader's own yes and stays quiet (`readerDecisionAsk`, 3 rows); Hebrew "אפשר להזיז את הפגישה של מחר ל..." with no old clock is a suppressed reschedule in family G, not a new hold (3 rows); a OneDrive target on Gmail stays silent (3 rows). English "please reply" with no To/Cc is held because the judge cannot tell whether the mail is aimed at this person; the eval gives no To/Cc, so those 4 rows are a harness gap (with a To that is this person they chip).

Also carried from the 2026-10-14 run: the integration tip already holds `פגישת`, so the rebased #151 keeps only what the tip lacked: `שיחת צוות` (the construct for a call) and the definite article on the artifact refusal (`פגישת הסיכום` is the summary, which the tip filed as a meeting).

| | before | after |
|---|---|---|
| Misses on the 108 that should act | 38 | 22 |
| Wrong Do It | 2/167 (`B-past-04`, `C-adv-cond-amt`) | 2/167, same two ids; this change added none |
| Rows recovered | | 16, none lost |
| `פגישת הסיכום` filed as a meeting | yes | no |
| `שיחת צוות` + a clock a calendar hold | no | yes |

Without the names (the harness as it ships): 69 misses before, 58 after; the remainder is the held greeting, a host rule.

Code: `flow-trial-extension/core/incoming-judge.js`, `close-chains.js`, `google-calendar.js`, `outlook-calendar.js`, `still-open.js` (the clock is read by tag, not `instanceof`); `core/intent.js` (`MEETING_NOUN_HE`). Tests: `test/judge-clock-realm-corpus.cjs` (new: 8 checks, 2 fail before), `test/meeting-construct-corpus.cjs` (now passes the person's names, as the host does).
Full `test/*-corpus.cjs` run: the same 17 files fail before and after (missing `jsdom` and other pre-existing failures); no new failure.
