# Decompose v1, lab reading (2026-11-12)

## 1. Frozen set, two-pass agreement labels (NOT owner-verified), product order, n = 565

| system | wrong Do It | missed | wrong action |
|---|---|---|---|
| engine | 6.4% (19/299) | 48.1% (128/266) | 12 |
| decomposed engine | 6.4% (19/299) | 47.4% (126/266) | 12 |
| engine + v33 | 6.4% (19/299) | 25.6% (68/266) | 17 |
| decomposed engine + v33 | 6.4% (19/299) | 25.6% (68/266) | 17 |

Mails with more than one intention: 1 (gold step of those: {"SILENT":1}). Single decisions changed by the clause pass: 2 ["draft:SILENT->draft","draft:SILENT->draft"].

## 2. Composed mails, parts the engine reads right alone (two clean training mails joined by "Also," / «בנוסף,»; teacher labels with the v3.3 audit, NOT owner-verified), n = 570, 770 gold intentions

| system | intentions found | steps offered that are not in the mail | every intention right, nothing extra |
|---|---|---|---|
| engine (whole mail) | 59.1% (455/770) | 0 | 44.7% (255/570) |
| decomposed engine | 87.1% (671/770) | 11 | 81.1% (462/570) |

By kind (every intention right): two acts of different steps 0.0% (0/200) -> 75.5% (151/200); an act and a silent mail 68.5% (137/200) -> 75.0% (150/200); two acts of the same step 69.4% (118/170) -> 94.7% (161/170).

Of the intentions the decomposed engine found, 0 are file asks handed to the file chain (find the one right file, then the draft). The lab cannot run that chain (no Drive), so they are counted as found on the assumption that it finds the file; in the product the chain may also stay quiet.

**These are stitched mails. They test the split, not recognition on a mail that was written with two intentions, and they are not a product quality number.** The natural set: `node scoreboard/decompose/natural.cjs`.
