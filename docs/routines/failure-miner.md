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
