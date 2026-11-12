# Decompose v1, lab reading (2026-11-12)

## 1. Frozen set, two-pass agreement labels (NOT owner-verified), product order, n = 565

| system | wrong Do It | missed | wrong action |
|---|---|---|---|
| engine | 6.4% (19/299) | 48.1% (128/266) | 12 |
| decomposed engine | 6.4% (19/299) | 47.4% (126/266) | 12 |
| engine + v33 | 6.4% (19/299) | 25.6% (68/266) | 17 |
| decomposed engine + v33 | 6.4% (19/299) | 25.6% (68/266) | 17 |

Mails with more than one intention: 1 (gold step of those: {"SILENT":1}). Single decisions changed by the clause pass: 2 ["draft:SILENT->draft","draft:SILENT->draft"].

## 2. Composed mails (two clean training mails joined by "Also," / «בנוסף,»; teacher labels with the v3.3 audit, NOT owner-verified), n = 583, 783 gold intentions

| system | intentions found | steps offered that are not in the mail | every intention right, nothing extra |
|---|---|---|---|
| engine (whole mail) | 35.2% (276/783) | 24 | 25.2% (147/583) |
| decomposed engine | 52.2% (409/783) | 42 | 43.7% (255/583) |

By kind (every intention right): two acts of different steps 0.0% (0/200) -> 27.5% (55/200); an act and a silent mail 34.5% (69/200) -> 39.0% (78/200); two acts of the same step 42.6% (78/183) -> 66.7% (122/183).
