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
| decomposed engine | 93.2% (718/770) | 11 | 89.3% (509/570) |

By kind (every intention right): two acts of different steps 0.0% (0/200) -> 98.0% (196/200); an act and a silent mail 68.5% (137/200) -> 76.0% (152/200); two acts of the same step 69.4% (118/170) -> 94.7% (161/170).
