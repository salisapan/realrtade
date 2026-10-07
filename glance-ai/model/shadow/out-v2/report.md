# Shadow v2 report

Built 2026-10-07T21:07:27.983Z. Reference = product-correct labels (engine 0.9.35 on the clean render + rule overrides; NOT owner-verified).
Masked metrics exclude 792 test rows flagged *unsure* (engine said nothing = intent-null on an ask-shaped frame addressed to the user; owner must decide). STRICT counts every reference silence, including those.
Engines are run on the live-shaped body (what production sees).

### Held-out test (masked)

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n | unsure rows shown | STRICT wrong-Do-It % |
|---|---|---|---|---|---|---|---|---|
| engine-0.9.34 | 9.71 | 479 | 9.48 | 3.53 | 13.2 | 19 | 30 | 8.89 |
| engine-0.9.35 | 10.33 | 510 | 7.65 | 3.53 | 10.22 | 19 | 30 | 9.43 |
| engine-r35p | 9.34 | 461 | 7.65 | 3.53 | 10.22 | 19 | 30 | 8.57 |
| v1+veto | 1.2 | 59 | 83.9 | 90.46 | 79.82 | 29 | 11 | 1.22 |
| v1c+veto | 0.73 | 36 | 89.24 | 94.61 | 85.9 | 12 | 3 | 0.68 |
| v2-model-alone | 11.31 | 558 | 46.93 | 42.53 | 49.68 | 37 | 86 | 11.24 |
| v2+veto | 0.06 | 3 | 50.68 | 47.1 | 52.91 | 36 | 79 | 1.43 |

### Held-out test, lang=he

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 11.83 | 282 | 3.53 | 3.53 |  | 16 |
| engine-0.9.35 | 11.83 | 282 | 3.53 | 3.53 |  | 16 |
| engine-r35p | 9.77 | 233 | 3.53 | 3.53 |  | 16 |
| v1+veto | 0.5 | 12 | 90.46 | 90.46 |  | 4 |
| v1c+veto | 0.17 | 4 | 94.61 | 94.61 |  | 0 |
| v2-model-alone | 10.4 | 248 | 42.53 | 42.53 |  | 4 |
| v2+veto | 0.04 | 1 | 47.1 | 47.1 |  | 3 |

### Held-out test, lang=en

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 7.72 | 197 | 13.2 |  | 13.2 | 3 |
| engine-0.9.35 | 8.94 | 228 | 10.22 |  | 10.22 | 3 |
| engine-r35p | 8.94 | 228 | 10.22 |  | 10.22 | 3 |
| v1+veto | 1.84 | 47 | 79.82 |  | 79.82 | 25 |
| v1c+veto | 1.25 | 32 | 85.9 |  | 85.9 | 12 |
| v2-model-alone | 12.15 | 310 | 49.68 |  | 49.68 | 33 |
| v2+veto | 0.08 | 2 | 52.91 |  | 52.91 | 33 |

### Held-out test, source=synthetic:v1-frame

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 11.78 | 223 | 15.22 | 3.23 | 18.69 | 13 |
| engine-0.9.35 | 13.42 | 254 | 9.66 | 3.23 | 11.53 | 13 |
| engine-r35p | 12.73 | 241 | 9.66 | 3.23 | 11.53 | 13 |
| v1+veto | 1.74 | 33 | 85.51 | 97.85 | 81.93 | 22 |
| v1c+veto | 1.22 | 23 | 89.13 | 96.77 | 86.92 | 11 |
| v2-model-alone | 13.1 | 248 | 41.06 | 46.24 | 39.56 | 31 |
| v2+veto | 0.05 | 1 | 42.03 | 46.24 | 40.81 | 31 |

### Held-out test, source=synthetic:v2-frame

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 12.11 | 250 | 8.38 | 3.95 | 13.38 | 6 |
| engine-0.9.35 | 12.11 | 250 | 8.38 | 3.95 | 13.38 | 6 |
| engine-r35p | 10.37 | 214 | 8.38 | 3.95 | 13.38 | 6 |
| v1+veto | 1.07 | 22 | 85.33 | 88.14 | 82.17 | 6 |
| v1c+veto | 0.53 | 11 | 91.02 | 93.79 | 87.9 | 1 |
| v2-model-alone | 14.1 | 291 | 41.32 | 37.57 | 45.54 | 4 |
| v2+veto | 0 | 0 | 46.71 | 42.66 | 51.27 | 4 |

### Held-out test, source=repo

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 0.35 | 2 | 0 | 0 | 0 | 0 |
| engine-0.9.35 | 0.35 | 2 | 0 | 0 | 0 | 0 |
| engine-r35p | 0.35 | 2 | 0 | 0 | 0 | 0 |
| v1+veto | 0.17 | 1 | 90.32 | 100 | 85 | 1 |
| v1c+veto | 0 | 0 | 91.94 | 100 | 87.5 | 0 |
| v2-model-alone | 0.52 | 3 | 95.16 | 90.91 | 97.5 | 1 |
| v2+veto | 0 | 0 | 98.39 | 100 | 97.5 | 1 |

### Held-out test, source=repo-test-strings

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 1 | 4 | 0 | 0 | 0 | 0 |
| engine-0.9.35 | 1 | 4 | 0 | 0 | 0 | 0 |
| engine-r35p | 1 | 4 | 0 | 0 | 0 | 0 |
| v1+veto | 0.75 | 3 | 65.77 | 84.62 | 63.27 | 0 |
| v1c+veto | 0.5 | 2 | 77.48 | 92.31 | 75.51 | 0 |
| v2-model-alone | 4 | 16 | 75.68 | 69.23 | 76.53 | 1 |
| v2+veto | 0.5 | 2 | 80.18 | 84.62 | 79.59 | 0 |

### Missed-close % by reference family (masked)

| family | engine-0.9.34 | engine-0.9.35 | engine-r35p | v1+veto | v1c+veto | v2-model-alone | v2+veto |
|---|---|---|---|---|---|---|---|
| follow-up-ask (n=612) | 6.86 | 6.86 | 6.86 | 82.68 | 89.22 | 42.32 | 49.35 |
| event (n=161) | 4.35 | 4.35 | 4.35 | 77.02 | 80.75 | 47.2 | 49.07 |
| dated-commitment (n=55) | 7.27 | 7.27 | 7.27 | 60 | 83.64 | 49.09 | 49.09 |
| commitment (n=86) | 22.09 | 22.09 | 22.09 | 97.67 | 98.84 | 41.86 | 43.02 |
| calendar-hold (n=51) | 9.8 | 9.8 | 9.8 | 84.31 | 96.08 | 72.55 | 72.55 |
| drive-file (n=73) | 52.05 | 20.55 | 20.55 | 97.26 | 89.04 | 71.23 | 71.23 |
| confirmed-amount (n=193) | 1.04 | 1.04 | 1.04 | 87.56 | 91.19 | 40.41 | 40.41 |
| calendar-cancel (n=8) | 25 | 25 | 25 | 100 | 100 | 100 | 100 |
| decision (n=16) | 0 | 0 | 0 | 93.75 | 93.75 | 100 | 100 |

### Missed-close % by lang:family (masked)

| lang:family | engine-0.9.34 | engine-0.9.35 | engine-r35p | v1+veto | v1c+veto | v2-model-alone | v2+veto |
|---|---|---|---|---|---|---|---|
| en:calendar-cancel (n=8) | 25 | 25 | 25 | 100 | 100 | 100 | 100 |
| en:calendar-hold (n=46) | 10.87 | 10.87 | 10.87 | 89.13 | 95.65 | 71.74 | 71.74 |
| en:commitment (n=85) | 22.35 | 22.35 | 22.35 | 97.65 | 98.82 | 42.35 | 42.35 |
| en:confirmed-amount (n=84) | 2.38 | 2.38 | 2.38 | 72.62 | 79.76 | 1.19 | 1.19 |
| en:dated-commitment (n=49) | 8.16 | 8.16 | 8.16 | 55.1 | 81.63 | 42.86 | 42.86 |
| en:decision (n=11) | 0 | 0 | 0 | 90.91 | 90.91 | 100 | 100 |
| en:drive-file (n=39) | 71.79 | 12.82 | 12.82 | 100 | 87.18 | 74.36 | 74.36 |
| en:event (n=111) | 3.6 | 3.6 | 3.6 | 76.58 | 80.18 | 43.24 | 45.95 |
| en:follow-up-ask (n=340) | 11.18 | 11.18 | 11.18 | 77.35 | 84.71 | 57.94 | 64.41 |
| he:calendar-hold (n=5) | 0 | 0 | 0 | 40 | 100 | 80 | 80 |
| he:commitment (n=1) | 0 | 0 | 0 | 100 | 100 | 0 | 100 |
| he:confirmed-amount (n=109) | 0 | 0 | 0 | 99.08 | 100 | 70.64 | 70.64 |
| he:dated-commitment (n=6) | 0 | 0 | 0 | 100 | 100 | 100 | 100 |
| he:decision (n=5) | 0 | 0 | 0 | 100 | 100 | 100 | 100 |
| he:drive-file (n=34) | 29.41 | 29.41 | 29.41 | 94.12 | 91.18 | 67.65 | 67.65 |
| he:event (n=50) | 6 | 6 | 6 | 78 | 82 | 56 | 56 |
| he:follow-up-ask (n=272) | 1.47 | 1.47 | 1.47 | 89.34 | 94.85 | 22.79 | 30.51 |

### Rule-corrected rows: wrong-Do-It % (these are the confirmed engine bugs)

| rule | engine-0.9.34 | engine-0.9.35 | engine-r35p | v1+veto | v1c+veto | v2-model-alone | v2+veto |
|---|---|---|---|---|---|---|---|
| cc-only (n=110) | 87.27 | 90 | 90 | 10 | 9.09 | 58.18 | 0 |
| addressed-to-other (n=254) | 91.34 | 93.7 | 93.7 | 17.32 | 9.45 | 61.02 | 0 |
| gmail-onedrive-target (n=64) | 31.25 | 90.63 | 90.63 | 0 | 0 | 26.56 | 0 |
| outlook-onedrive-save (n=21) | miss 47.62 | miss 47.62 | miss 47.62 | miss 100 | miss 90.48 | miss 47.62 | miss 47.62 |
| no-action-fyi (n=54) | 90.74 | 90.74 | 0 | 0 | 0 | 3.7 | 0 |
| negated-save (n=6) | 100 | 100 | 100 | 0 | 0 | 0 | 0 |
| marketing (n=18) | 94.44 | 94.44 | 94.44 | 0 | 0 | 0 | 0 |

### Format-sensitive rows (engine flips between clean and live render)

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 65.71 | 46 | 89.71 | 44.44 | 96.61 | 7 |
| engine-0.9.35 | 65.71 | 46 | 89.71 | 44.44 | 96.61 | 7 |
| engine-r35p | 65.71 | 46 | 89.71 | 44.44 | 96.61 | 7 |
| v1+veto | 0 | 0 | 94.12 | 88.89 | 94.92 | 1 |
| v1c+veto | 0 | 0 | 95.59 | 100 | 94.92 | 0 |
| v2-model-alone | 17.14 | 12 | 52.94 | 66.67 | 50.85 | 7 |
| v2+veto | 0 | 0 | 58.82 | 77.78 | 55.93 | 7 |

### Typo rows

| system | wrong-Do-It % | wrong-Do-It n | missed-close % | HE missed % | EN missed % | wrong action n |
|---|---|---|---|---|---|---|
| engine-0.9.34 | 9.86 | 29 | 37.04 | 13.79 | 50 | 2 |
| engine-0.9.35 | 10.2 | 30 | 37.04 | 13.79 | 50 | 2 |
| engine-r35p | 10.2 | 30 | 37.04 | 13.79 | 50 | 2 |
| v1+veto | 1.36 | 4 | 93.83 | 100 | 90.38 | 1 |
| v1c+veto | 0.34 | 1 | 96.3 | 100 | 94.23 | 0 |
| v2-model-alone | 9.52 | 28 | 55.56 | 62.07 | 51.92 | 1 |
| v2+veto | 0 | 0 | 56.79 | 62.07 | 53.85 | 1 |

### Adversarial-v2 (spec labels, never trained on; AMBIGUOUS excluded)

| system | correct | wrong-Do-It | v1 set | v2 set |
|---|---|---|---|---|
| engine-0.9.34 | 45/72 | 18 | 26/40 | 19/32 |
| engine-0.9.35 | 53/72 | 15 | 35/40 | 18/32 |
| engine-r35p | 55/72 | 13 | 35/40 | 20/32 |
| v1+veto | 54/72 | 3 | 34/40 | 20/32 |
| v1c+veto | 53/72 | 3 | 35/40 | 18/32 |
| v2-model-alone | 61/72 | 7 | 37/40 | 24/32 |
| v2+veto | 67/72 | 0 | 38/40 | 29/32 |

| case | expect | engine-0.9.34 | engine-0.9.35 | engine-r35p | v1+veto | v1c+veto | v2-model-alone | v2+veto |
|---|---|---|---|---|---|---|---|---|
| adv-neg-drive-1 | SILENT | **file_save** | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-drive-2 | SILENT | **file_save** | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-drive-3 | SILENT | **file_save** | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-drive-4 | SILENT | **file_save** | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-od-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-od-2 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-he-1 | SILENT | **file_save** | **file_save** | **file_save** | SILENT | SILENT | SILENT | SILENT |
| adv-neg-he-2 | SILENT | **file_save** | **file_save** | **file_save** | SILENT | SILENT | SILENT | SILENT |
| adv-neg-send | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-fwd | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-meet | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-neg-pay | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-od-save-1 | file_save | **SILENT** | file_save | file_save | **SILENT** | **SILENT** | file_save | file_save |
| adv-od-save-2 | file_save | **SILENT** | file_save | file_save | **SILENT** | **SILENT** | file_save | file_save |
| adv-od-save-3 | file_save | **SILENT** | file_save | file_save | **SILENT** | **SILENT** | file_save | file_save |
| adv-od-save-4 | file_save | **SILENT** | file_save | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv-od-save-5 | file_save | **draft** | file_save | file_save | **draft** | file_save | file_save | file_save |
| adv-od-save-he | file_save | **draft** | **draft** | **draft** | **SILENT** | file_save | file_save | file_save |
| adv-od-hedge | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-od-noatt | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | **file_save** | SILENT |
| adv-drive-att0 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-drive-att2 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-drive-hedge | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-drive-pos | file_save | file_save | file_save | file_save | file_save | **SILENT** | **SILENT** | **SILENT** |
| adv-meet-pos | calendar | calendar | calendar | calendar | calendar | calendar | calendar | calendar |
| adv-req-pos | draft | draft | draft | draft | draft | draft | draft | draft |
| adv-past-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-past-2 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-cancel-1 | AMBIGUOUS | **calendar** | **calendar** | **calendar** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv-ooo-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-mkt-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-mkt-he | SILENT | **calendar** | **calendar** | **calendar** | SILENT | SILENT | SILENT | SILENT |
| adv-3p-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-3p-he | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-fwd-quoted | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-inject-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-inject-2 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-cond-amt | SILENT | **task** | **task** | **task** | SILENT | SILENT | SILENT | SILENT |
| adv-fyi-he | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-self-out | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv-self-out-o | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-he-fyi-noact-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-he-fyi-noact-2 | SILENT | **draft** | **draft** | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-he-fyi-noact-3 | SILENT | **draft** | **draft** | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-he-fyi-noact-4 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-he-pos-action-1 | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-he-pos-action-2 | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-to-other-en | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT |
| adv2-to-other-he | SILENT | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT |
| adv2-to-other-inline | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT | SILENT |
| adv2-cc-only-en | SILENT | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT |
| adv2-cc-only-he | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT |
| adv2-to-own-en | draft | draft | draft | draft | draft | **SILENT** | draft | draft |
| adv2-to-own-he | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-to-own-cc | draft | draft | draft | draft | draft | draft | draft | draft |
| adv2-to-none-en | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | draft | **SILENT** |
| adv2-gmail-od-1 | SILENT | SILENT | **file_save** | **file_save** | SILENT | SILENT | **file_save** | SILENT |
| adv2-gmail-od-he | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-outlook-od-he | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv2-cond-he | SILENT | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT |
| adv2-cond-en-2 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-mkt-he-2 | SILENT | **calendar** | **calendar** | **calendar** | SILENT | SILENT | SILENT | SILENT |
| adv2-mkt-he-3 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-neg-he-pay | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-neg-he-send | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-fmt-crlf-ask | draft | **SILENT** | **SILENT** | **SILENT** | draft | **SILENT** | draft | draft |
| adv2-fmt-rlm-hedge | SILENT | **file_save** | **file_save** | **file_save** | SILENT | SILENT | SILENT | SILENT |
| adv2-fmt-rlm-ask | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-fmt-disclaimer | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv2-typo-he-ask | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-typo-en-ask | draft | draft | draft | draft | **SILENT** | **SILENT** | draft | draft |
| adv2-mixed-he-ask | draft | draft | draft | draft | draft | draft | draft | draft |
| adv2-file-ask-he | AMBIGUOUS | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **draft** | **SILENT** |
| adv2-he-meet | calendar | calendar | calendar | calendar | **SILENT** | **SILENT** | **SILENT** | **SILENT** |

### OSS-worker eval set (275 rows, binary gold act/silence, external phrasing; gold partly teacher-derived)

| system | wrong-Do-It | % | missed | % | HE missed % |
|---|---|---|---|---|---|
| engine-0.9.34 | 16/167 | 9.58 | 26/108 | 24.07 | 36 |
| engine-0.9.35 | 15/167 | 8.98 | 23/108 | 21.3 | 36 |
| engine-r35p | 15/167 | 8.98 | 23/108 | 21.3 | 36 |
| v1+veto | 4/167 | 2.4 | 78/108 | 72.22 | 82 |
| v1c+veto | 1/167 | 0.6 | 93/108 | 86.11 | 98 |
| v2-model-alone | 12/167 | 7.19 | 59/108 | 54.63 | 62 |
| v2+veto | 0/167 | 0 | 64/108 | 59.26 | 64 |

## All wrong-Do-Its

### v2+veto, held-out test (masked) (3)

- `v2syn-9371` [he/gmail/file_place] ref=SILENT pred=calendar-hold|calendar p=0.91 eng35=SILENT — "בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00."
- `v2rtest-close-families-corpus-128` [en/gmail/repo-test] ref=SILENT pred=confirmed-amount|task p=0.888 eng35=SILENT — "Confirming the fee is about $4,200."
- `v2rtest-intent-actions-corpus-1122` [en/outlook/repo-test] ref=SILENT pred=commitment|task p=0.959 eng35=SILENT — "As a reminder, you agreed to send the invoice by Friday, September 18."

### v1+veto, held-out test (masked) (59)

- `v2syn-155` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.838 eng35=follow-up-ask|draft — "Good morning Maya, Hope your week is going well. Can you review the CV and get back to me by Wednesday, October 14? Thank you"
- `v2syn-157` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.975 eng35=follow-up-ask|draft — "Hey,\n\nHope your week is going well.\n\nCan you review the NDA and get back to me before Sunday?\n\nBest,\nDana"
- `v2syn-159` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.942 eng35=follow-up-ask|draft — "Lior, can you review the onboarding checklist and get back to me tomorrow?\n\nRegards,\nMichael\n\n--\nMichael Ross\nHead of Ops | Acme Ltd\n+972-54-1095028"
- `v2syn-169` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.98 eng35=follow-up-ask|draft — "Dear Maya, Can you review the W-9 form and get back to me by EOD? Thanks\n\nSent from my iPhone"
- `v2syn-401` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.999 eng35=follow-up-ask|draft — "Hey Avi,\n\nCan you please approve the pilot by Oct 20?\n\nThanks,\nRachel\n\n--\nRachel Green\nHead of Ops | Acme Ltd\n+972-54-1095028"
- `v2syn-588` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.976 eng35=follow-up-ask|draft — "Noa, reminder: the payment of €750 is due by Thursday. Please process it. Best"
- `v2syn-770` [en/gmail/commitment_reader] ref=SILENT pred=commitment|task p=0.984 eng35=dated-commitment|task — "Hello, As agreed, you will send the CV on Monday. Cheers"
- `v2syn-809` [en/gmail/commitment_reader] ref=SILENT pred=commitment|task p=0.997 eng35=dated-commitment|task — "Hi Rachel,\n\nAs agreed, you will send the invoice by Oct 20.\n\nRegards,\nEthan"
- `v2syn-869` [en/gmail/commitment_reader] ref=SILENT pred=follow-up-ask|draft p=0.982 eng35=event|calendar — "Lior, per our call, you said you would review the quarterly report before Sunday.\r\n\r\nBest regards,\r\nEthan"
- `v2syn-873` [en/gmail/commitment_reader] ref=SILENT pred=follow-up-ask|draft p=0.937 eng35=commitment|task — "Good morning Michael,\r\n\r\nPer our call, you said you would review the budget spreadsheet today.\r\n\r\nRegards,\r\nSarah\r\n\r\n--\r\nSarah Cohen\r\nCFO | Globex Inc.\r\n+972-54-1087109"
- `v2syn-883` [en/gmail/commitment_reader] ref=SILENT pred=follow-up-ask|draft p=0.989 eng35=event|calendar — "Michael, per our call, you said you would review the deck by Oct 20.\n\nBest regards,\nSarah"
- `v2syn-3801` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.937 eng35=confirmed-amount|task — "Hello,\n\nApproved: ₪15,000 for onboarding.\n\nThanks,\nSarah\n\n--\nSarah Cohen\nCFO | Globex Inc.\n+972-54-1087109"
- `v2syn-3802` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.997 eng35=confirmed-amount|task — "Hey Rachel,\n\nApproved: ₪3,400 for the budget.\n\nThanks,\nDana\n\n--\nDana Levi\nProduct Lead | Acme Ltd\n+972-54-1071271"
- `v2syn-3803` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.996 eng35=confirmed-amount|task — "Hey Maya,\r\n\r\nApproved: €750 for the budget.\r\n\r\nThanks,\r\nTom"
- `v2syn-3804` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.959 eng35=confirmed-amount|task — "Good morning Lior, Approved: $4,850 for the pilot. Regards"
- `v2syn-3805` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.954 eng35=confirmed-amount|task — "Good morning Lior, Approved: $4,850 for the piilot. Regards"
- `v2syn-3812` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.978 eng35=confirmed-amount|task — "Hi,\n\nApproved: ₪15,000 for the pilot.\n\nBest regards,\nBilling\n\n--\nBilling\nHead of Ops | Northwind\n+972-54-1055433"
- `v2syn-3813` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.994 eng35=confirmed-amount|task — "Lior, Approved: ₪1,200 for the migration. Thanks!"
- `v2syn-3815` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.96 eng35=confirmed-amount|task — "Hi, Approved: ₪15,000 for onboarding. Many thanks"
- `v2syn-3816` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.987 eng35=confirmed-amount|task — "Hey Maya,\n\nApproved: ₪3,400 for the migration.\n\nMany thanks,\nBilling"
- `v2syn-3821` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.946 eng35=confirmed-amount|task — "Noa, Approved: ₪1,200 for onboarding. Cheers"
- `v2syn-3822` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.997 eng35=confirmed-amount|task — "Approved: ₪15,000 for the campaign."
- `v2syn-3825` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.971 eng35=confirmed-amount|task — "Good morning Maya, Approved: ₪1,200 for the launch checklist. Thanks"
- `v2syn-3826` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.946 eng35=confirmed-amount|task — "Good morning Maya, Approved: ₪1,200 for the launch chelkist. Thanks"
- `v2syn-3827` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.99 eng35=confirmed-amount|task — "Hi,\r\n\r\nApproved: $1,200 for the renewal.\r\n\r\nThanks!\r\nEthan\r\n\r\n--\r\nEthan Hunt\r\nAccount Manager | Northwind\r\n+972-54-1079190"
- `v2syn-3828` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.997 eng35=confirmed-amount|task — "Approved: ₪3,400 for the campaign."
- `v2syn-3831` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.999 eng35=confirmed-amount|task — "Approved: $89 for the budget."
- `v2syn-3834` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.97 eng35=confirmed-amount|task — "Hello,\n\nRachel, approved: $4,850 for onboarding.\n\nBest regards,\nDana"
- `v2syn-3840` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.984 eng35=confirmed-amount|task — "Hey Rachel,\n\nApproved: $1,200 for onboarding.\n\nThank you,\nTom"
- `v2syn-3841` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.993 eng35=confirmed-amount|task — "Approved: ₪3,400 for the launch checklist."
- `v2syn-3842` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.998 eng35=confirmed-amount|task — "Lior, approved: $89 for the migration.\n\nCheers,\nRachel\n\n--\nRachel Green\nHead of Ops | Acme Ltd\n+972-54-1095028"
- `v2syn-7009` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=1 eng35=follow-up-ask|draft — "תוכלי לעבור על הזמנת הרכש ולחזור אליי עד יום רביעי?"
- `v2syn-11374` [he/gmail/third_party] ref=SILENT pred=follow-up-ask|draft p=0.995 eng35=follow-up-ask|draft — "צהריים טובים,\r\n\r\nאבי, נא לשלם את החשבונית של $500 עד יום ראשון.\r\n\r\nיום נעים,\r\nמיכאל\r\n\r\nנשלח מה-iPhone שלי"
- `v2syn-12083` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.997 eng35=follow-up-ask|draft — "Michael, could you please share the budget spreadsheet by November 2?\n\nThank you,\nBilling"
- `v2syn-12557` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.978 eng35=follow-up-ask|draft — "Avi, could you update the lease next Tuesday?"
- `v2syn-12743` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.994 eng35=follow-up-ask|draft — "Noa, can you prepare the resume by Oct 20?"
- `v2syn-12808` [en/gmail/request_reply] ref=SILENT pred=event|calendar p=0.983 eng35=calendar-hold|calendar — "Avi,\n\nFollowing up on our call.\n\nCan you set up a interview next Monday at 4:30pm?\n\nThanks!\nDana\n\n--\nDana Levi\nProduct Lead | Acme Ltd\n+972-54-1071271"
- `v2syn-13326` [en/gmail/request_reply] ref=SILENT pred=event|calendar p=0.977 eng35=calendar-hold|calendar — "Hi, Following up on our call. Rachel, please set up a call Sunday at 11:15 Thank you"
- `v2syn-13513` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.94 eng35=follow-up-ask|draft — "Hi Rachel, Please wire ₪15,000 by Oct 20. Thanks!"
- `v2syn-13647` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.865 eng35=follow-up-ask|draft — "Avi, can you transfer ₪3,400 to the vendor by Wednesday, October 14? Regards"
- `v2syn-13648` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.922 eng35=follow-up-ask|draft — "Avi, can you trnsfer ₪3,400 to the vendor by Wednesday, October 14? Regards"
- `v2syn-13684` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.991 eng35=follow-up-ask|draft — "Hello,\n \nHope you are well.\nCould you pay the ₪15,000 invoice by Wednesday, October 14?\n \nRegards,\nTom\n\n[image: logo]\nTom Baker\nProduct Lead | Acme Ltd\n+972-54-1071271\n"
- `v2syn-13696` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.998 eng35=follow-up-ask|draft — "Hello,\r\n \r\n\r\nCould you pay the €750 invoice by Thursday?\r\n \r\nBest,\r\nDana\r\n\r\n[image: logo]\r\nDana Levi\r\nProduct Lead | Acme Ltd\r\n+972-54-1071271\r\n"
- `v2syn-13701` [en/gmail/payment] ref=SILENT pred=follow-up-ask|draft p=0.986 eng35=follow-up-ask|draft — "Good morning,\r\n\r\nRachel, could you pay the ₪3,400 invoice before Sunday?\r\n\r\nThank you,\r\nSarah\r\n\r\n--\r\nSarah Cohen\r\nCFO | Globex Inc.\r\n+972-54-1087109"
- `v2syn-15110` [en/gmail/decision] ref=SILENT pred=confirmed-amount|task p=0.98 eng35=confirmed-amount|task — "We approved ₪1,200 for the renewal this morning."
- `v2syn-15121` [en/outlook/decision] ref=SILENT pred=confirmed-amount|task p=0.927 eng35=confirmed-amount|task — "Noa, we approved ₪1,200 for the pilot this morning."
- `v2syn-18736` [he/gmail/request_reply] ref=SILENT pred=event|calendar p=0.998 eng35=follow-up-ask|draft — "היי, אבי, תוכל לחתום על החוזה החתום ולהחזיר ביום שני? בתודה"
- `v2syn-18771` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.993 eng35=follow-up-ask|draft — "נא לחתום ולהחזיר את הקבלה עד סוף היום בברכה"
- `v2syn-19343` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.999 eng35=follow-up-ask|draft — "תוכלי למלא את המצגת עד יום חמישי?\n\nנשלח מה-iPhone שלי"
- `v2syn-19573` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.999 eng35=follow-up-ask|draft — "מאיה,\n\nתוכלו להכין את טופס המס עד ה-20 באוקטובר?\n\nבברכה,\nאבי\n\n--\nאבי בירנבאום\nמנהלת לקוחות | אקמי בע״מ\n054-1095028\nwww.acme.co.il"
- `v2syn-20080` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.999 eng35=follow-up-ask|draft — "דנה, נשמח אם תוכלו להכין את הדוח הרבעוני עד יום ראשון? המשך יום טוב\n\nנשלח מה-iPhone שלי"
- `v2syn-20081` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.997 eng35=follow-up-ask|draft — "דנה, נשמח אם תוכלו להכינ את הדוח הרבעוני עד יום ראשון? המשך יום טוב\n\nנשלח מה-iPhone שלי"
- `v2syn-21417` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.999 eng35=follow-up-ask|draft — "דנה, תוכלי לעשות approve להמעבר לענן ביום שלישי הבא?"
- `v2syn-23190` [he/gmail/meeting] ref=SILENT pred=event|calendar p=0.969 eng35=calendar-hold|calendar — "שירן שלום, נוכל לעשות שיחה קצרה ביום רביעי בשעה 11:15? תודה רבה"
- `v2syn-24177` [he/gmail/drive_save] ref=SILENT pred=drive-file|file_save p=0.762 eng35=drive-file|file_save — "pls תשמור את הקובץ המצורף בגוגל דרייב"
- `v2repo-intent-teacher-eval-188-gmail` [he/gmail/repo] ref=SILENT pred=follow-up-ask|draft p=0.746 eng35=SILENT — "אני צריך את המספר הסידורי של הלפטופ, תוכל למצוא ולשלוח?"
- `v2rtest-capture-corpus-50` [en/gmail/repo-test] ref=SILENT pred=follow-up-ask|draft p=0.905 eng35=SILENT — "Can you send the lease please?"
- `v2rtest-judgment-corpus-1276` [en/gmail/repo-test] ref=SILENT pred=confirmed-amount|task p=0.913 eng35=SILENT — "Suppose we approved the $40,000 for the pilot — would that actually work on your side?"
- `v2rtest-request-types-corpus-1578` [en/gmail/repo-test] ref=SILENT pred=follow-up-ask|draft p=0.856 eng35=SILENT — "Can you countersign the lease and send it back?"

### v2+veto, OSS eval (0)


### v1+veto, OSS eval (4)

- `oss-en-3p-163` [en/A/hand-override(teacher wrong-Do-It)] ref=silence pred=follow-up-ask|draft — "Dana, can you send the final numbers for the budget to the client by Friday? Sali cc'd for visibility.\nAlex"
- `oss-en-3p-169` [en/A/hand-override(teacher wrong-Do-It)] ref=silence pred=follow-up-ask|draft — "Tom, can you send the final numbers for the budget to the client by Friday? Sali cc'd for visibility.\nTom"
- `oss-C-adv-drive-att0` [en/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "Please save the attached file to Drive."
- `oss-C-adv-drive-att2` [en/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "Please save the attached file to Drive."

### engine 0.9.35, OSS eval (15)

- `oss-he-news-102` [he/A/hand-override(teacher wrong-Do-It)] ref=silence pred=event|calendar — "הזמנה לוובינר ביום חמישי בשעה 16:00. להרשמה לחצו כאן. להסרה מרשימת התפוצה."
- `oss-he-news-106` [he/A/hand-override(teacher wrong-Do-It)] ref=silence pred=event|calendar — "הזמנה לוובינר ביום חמישי בשעה 16:00. להרשמה לחצו כאן. להסרה מרשימת התפוצה."
- `oss-en-3p-163` [en/A/hand-override(teacher wrong-Do-It)] ref=silence pred=follow-up-ask|draft — "Dana, can you send the final numbers for the budget to the client by Friday? Sali cc'd for visibility.\nAlex"
- `oss-en-3p-165` [en/A/hand-override(teacher wrong-Do-It)] ref=silence pred=follow-up-ask|draft — "Dana, can you send the final numbers for hiring plan to the client by Friday? Sali cc'd for visibility.\nRachel"
- `oss-en-3p-169` [en/A/hand-override(teacher wrong-Do-It)] ref=silence pred=follow-up-ask|draft — "Tom, can you send the final numbers for the budget to the client by Friday? Sali cc'd for visibility.\nTom"
- `oss-B-neg-05` [he/B/hand] ref=silence pred=drive-file|file_save — "אל תשמור את הקובץ המצורף בדרייב, זו טיוטה."
- `oss-B-past-04` [he/B/hand] ref=silence pred=dated-commitment|task — "החוזה היה אמור להגיע ביום שישי שעבר וחתמנו בזמן."
- `oss-B-3p-01` [en/B/hand] ref=silence pred=follow-up-ask|draft — "Michael, please send Sali's team the numbers by Friday."
- `oss-C-adv-neg-he-1` [he/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "בבקשה אל תשמור את הקובץ המצורף בדרייב."
- `oss-C-adv-neg-he-2` [he/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "אין צורך לשמור את הקובץ המצורף בדרייב."
- `oss-C-adv-od-noatt` [en/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "Please save the attached file to OneDrive by Friday."
- `oss-C-adv-drive-att0` [en/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "Please save the attached file to Drive."
- `oss-C-adv-drive-att2` [en/C/worker-adversarial-spec] ref=silence pred=drive-file|file_save — "Please save the attached file to Drive."
- `oss-C-adv-mkt-he` [he/C/worker-adversarial-spec] ref=silence pred=event|calendar — "הצטרפו לוובינר ביום שלישי בשעה 15:00! ההרשמה פתוחה."
- `oss-C-adv-cond-amt` [en/C/worker-adversarial-spec] ref=silence pred=confirmed-amount|task — "If we approve the $40,000 we would sign Monday, but nothing has been decided internally yet."

- engine-0.9.35 held-out wrong-Do-Its vs product reference: 510 (all listed in report.json); engine-r35p: 461

### v2+veto shows on UNSURE rows (not counted as wrong-Do-It in masked metrics; owner decides) (40)

- `v2syn-205` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.985 eng35=SILENT — "Sali, we still need the budget spreadsheet from you by Thursday before we can onboard.\n\nMany thanks,\nEthan\n\nSent from my iPhone"
- `v2syn-314` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.982 eng35=SILENT — "Sali, any chance you can send the SOW by Wednesday, October 14? Best regards\n\nSent from my iPhone"
- `v2syn-405` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.996 eng35=SILENT — "Hi all, Can you please approve onboarding asap? Best"
- `v2syn-410` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.987 eng35=SILENT — "Hi all,\n\nCan you please approve onboarding asap?\n\nMany thanks,\nBilling"
- `v2syn-779` [en/gmail/commitment_reader] ref=SILENT pred=commitment|task p=0.929 eng35=SILENT — "Hi all, As agreed, you will send the purchase order by end of week. Thank you"
- `v2syn-785` [en/outlook/commitment_reader] ref=SILENT pred=commitment|task p=0.959 eng35=SILENT — "As agreed, you will send the expense report today."
- `v2syn-807` [en/gmail/commitment_reader] ref=SILENT pred=commitment|task p=0.989 eng35=SILENT — "Hey,\n\nAs agreed, you will send the invoice asap.\n\nCheers,\nBilling\n\n--\nBilling\nHead of Ops | Northwind\n+972-54-1055433"
- `v2syn-808` [en/gmail/commitment_reader] ref=SILENT pred=commitment|task p=0.984 eng35=SILENT — "Hey,\n\nAs agreed, you wil send the invooice asap.\n\nCheers,\nBilling\n\n--\nBilling\nHead of Ops | Northwind\n+972-54-1055433"
- `v2syn-6916` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.973 eng35=SILENT — "שלום,\n\nאפשר לשלוח לי את אישור ניכוי מס במקור עד מחר בבוקר?\n\nבתודה,\nדנה"
- `v2syn-6929` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.974 eng35=SILENT — "צהריים טובים,\n \n\nאפשר לשלוח לי את אישור הביטוח עד יום שני?\n \nבברכה,\nאבי\n\n[image: logo]\nאבי בירנבאום\nמנהלת לקוחות | אקמי בע״מ\n054-1095028\nwww.acme.co.il\n"
- `v2syn-6930` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.979 eng35=SILENT — "סאלי, אפשר לשלוח לי את נספח ב׳ מחר?"
- `v2syn-7002` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.977 eng35=SILENT — "תוכלי לעבור על הקבלות מהנסיעה ולחזור אליי ASAP? תודה!"
- `v2syn-7010` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.983 eng35=SILENT — "סאלי, תוכלי לעבור על גיליון התמחור ולחזור אליי לפני החג?\n\nתודה רבה,\nנועה"
- `v2syn-7685` [he/gmail/commitment_reader] ref=SILENT pred=follow-up-ask|draft p=0.97 eng35=dated-commitment|task — "שלום,\r\n\r\nרק תזכורת: התחייבת לשלוח את ה-SOW ביום שלישי הבא.\r\n\r\nתודה,\r\nשרה\r\n\r\n--\r\nשרה מזרחי\r\nסמנכ״ל כספים | אקמי בע״מ\r\n054-1071271\r\nwww.acme.co.il\r\n\r\nנשלח מה-iPhone שלי"
- `v2syn-8402` [he/gmail/meeting] ref=SILENT pred=event|calendar p=0.923 eng35=SILENT — "בוקר טוב,\n\nנדבר ביום רביעי הבא ב-14:30 על ה-onboarding?\n\nתודה!\nמיכאל"
- `v2syn-9285` [he/gmail/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.971 eng35=SILENT — " \r\n\r\nתשלח בבקשה את טופס 101 כקובץ מצורף עד מחר בבוקר.\r\n \r\nתודה,\r\nדנה\r\n\r\n[image: logo]\r\nדנה לוי\r\nיועצת משפטית | גלובקס\r\n054-1055433\r\nwww.acme.co.il\r\n\r\nהודעה זו והמצורפים לה מיועדים לנמען בלבד ועשויים להכיל מידע חסוי. אם ק"
- `v2syn-9286` [he/gmail/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.986 eng35=SILENT — "סאלי,\n\nתשלח בבקשה את קורות החיים כקובץ מצורף עד ה-15 באוקטובר.\n\nבברכה,\nהילה"
- `v2syn-9297` [he/outlook/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.977 eng35=SILENT — "שבוע טוב!\r\n\r\nתשלח בבקשה את ה-SOW כקובץ מצורף עד ה-20 באוקטובר.\r\n\r\nיום נעים,\r\nאבי\r\n\r\n--\r\nאבי בירנבאום\r\nמנהלת לקוחות | אקמי בע״מ\r\n054-1095028\r\nwww.acme.co.il"
- `v2syn-9308` [he/outlook/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.979 eng35=dated-commitment|task — "בוקר טוב,\n\nתשלח בבקשה את קורות החיים כקובץ מצורף עד יום שני.\n\nיום נעים,\nדנה\n\nנשלח מה-iPhone שלי"
- `v2syn-9312` [he/gmail/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.981 eng35=SILENT — "הי סאלי, תשלח בבקשה את תעודת ההתאגדות כקובץ מצורף עד ה-20 באוקטובר. תודה"
- `v2syn-9313` [he/gmail/reply_with_file] ref=SILENT pred=follow-up-ask|draft p=0.986 eng35=SILENT — "סאלי, תשלח בבקשה את הזמנת הרכש כקובץ מצורף עד יום ראשון. תודה"
- `v2syn-12142` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.988 eng35=SILENT — "Hey,\n \n\nCan I get the budget spreadsheet from you next Tuesday?\n \nCheers,\nEthan\n\n[image: logo]\nEthan Hunt\nAccount Manager | Northwind\n+972-54-1079190\n\n\nSent from my iPhone"
- `v2syn-12143` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.972 eng35=SILENT — "Hey,\n \n\nCan I get the budgte spreadsheet from you next Tuesday?\n \nCheers,\nEthan\n\n[image: logo]\nEthan Hunt\nAccount Manager | Northwind\n+972-54-1079190\n\n\nSent from my iPhone"
- `v2syn-12144` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.988 eng35=SILENT — "Can I get the lease from you by Friday?\n\nSent from my iPhone"
- `v2syn-12147` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.997 eng35=SILENT — "Hello,\n\nCan I get the budget spreadsheet from you by Thursday?\n\nBest,\nEthan"
- `v2syn-12865` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.972 eng35=SILENT — "Hi all,\n\nWould you be able to fill out the board memo today?\n\nBest,\nSarah\n\n--\nSarah Cohen\nCFO | Globex Inc.\n+972-54-1087109"
- `v2syn-13278` [en/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.993 eng35=SILENT — "Please double-check the tax form by October 15"
- `v2syn-13279` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.989 eng35=SILENT — "Hi all, Please double-check the purchase order by Thursday Best regards"
- `v2syn-13283` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.99 eng35=SILENT — "Hi team,\n\nPlease double-check the tax form by Friday\n\nThanks!\nTom\n\n--\nTom Baker\nProduct Lead | Acme Ltd\n+972-54-1071271"
- `v2syn-13286` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.994 eng35=SILENT — "Hi team,\n\nPlease double-check the SOW by Thursday\n\nBest regards,\nMichael"
- `v2syn-13291` [en/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.991 eng35=SILENT — "Hi all,\n\nPlease double-check the invoice next Tuesday\n\nCheers,\nTom"
- `v2syn-17987` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.994 eng35=SILENT — "נשמח אם תוכלו לשלוח לי את תעודת ההתאגדות לפני החג? תודה!"
- `v2syn-18010` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.975 eng35=SILENT — "היי,\n\nנשמח אם תוכלו להעביר אליי את גיליון התמחור עד סוף השבוע?\n\nבתודה,\nיוסי\n\n--\nיוסי אברהם\nמנהל תפעול | גלובקס\n054-1079190\nwww.acme.co.il"
- `v2syn-18271` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.972 eng35=SILENT — "סאלי, שלח לי בבקשה את אישור הביטוח עד ה-20 באוקטובר\n\nהמשך יום טוב,\nאבי"
- `v2syn-18282` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.988 eng35=SILENT — "בוקר טוב,\r\n\r\nשלח לי בבקשה את אישור הביטוח עד יום שישי\r\n\r\nיום נעים,\r\nדנה"
- `v2syn-19079` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.991 eng35=SILENT — "שלום,\r\n\r\nאפשר להעלות את ההצעה למערכת עד ה-20 באוקטובר?\r\n\r\nתודה רבה,\r\nנועה"
- `v2syn-19082` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.984 eng35=dated-commitment|task — "שלום רב,\r\n\r\nאפשר להעלות את ה-invoice למערכת עד יום ראשון?\r\n\r\nבברכה,\r\nנועה\r\n\r\nנשלח מה-iPhone שלי"
- `v2syn-19085` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.994 eng35=SILENT — "היי,\r\n\r\nאפשר להעלות את החוזה החתום למערכת ביום שני?\r\n\r\nבתודה,\r\nשרה"
- `v2syn-19088` [he/outlook/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.99 eng35=SILENT — "בוקר טוב,\n\nאפשר להעלות את החוזה החתום למערכת עד ה-15 באוקטובר?\n\nתודה רבה,\nאבי\n\n--\nאבי בירנבאום\nמנהלת לקוחות | אקמי בע״מ\n054-1095028\nwww.acme.co.il"
- `v2syn-19091` [he/gmail/request_reply] ref=SILENT pred=follow-up-ask|draft p=0.979 eng35=SILENT — "עומר שלום, אפשר להעלות את תעודת ההתאגדות למערכת עד יום חמישי? בתודה"

…39 more in report.json
