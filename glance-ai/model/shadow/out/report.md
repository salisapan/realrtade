# Glance shadow report

Generated 2026-10-07T20:13:14.147Z · teacher = 0.9.34 deterministic engine · offline only, nothing surfaced.

## v1  (show threshold τ=0.95)

### Held-out test (n=4111) vs teacher

| mode | agree (exact) | show/silence agree | **wrong-Do-It** | wrong-Do-It in model-free region | missed-close | wrong action when both show |
|---|---|---|---|---|---|---|
| teacherV2 | 99.27% | 99.27% | **0.00%** (0/3142) | 0.00% (0/2089) | 3.10% (30/969) | 0.00% |
| model | 82.90% | 84.09% | **0.70%** (22/3142) | 0.48% (10/2089) | 65.22% (632/969) | 3.56% |
| modelVeto | 82.70% | 83.90% | **0.29%** (9/3142) | 0.43% (9/2089) | 67.39% (653/969) | 3.80% |
| modelVetoV2 | 82.70% | 83.90% | **0.29%** (9/3142) | 0.43% (9/2089) | 67.39% (653/969) | 3.80% |

### By source (modelVetoV2)

| source | n | agree | wrong-Do-It | missed-close |
|---|---|---|---|---|
| repo | 640 | 90.63% | 0.17% (1/576) | 90.63% (58/64) |
| repo-test-strings | 511 | 84.34% | 0.76% (3/396) | 66.96% (77/115) |
| synthetic | 2960 | 80.71% | 0.23% (5/2170) | 65.57% (518/790) |

### By teacher label (modelVetoV2)

| teacher label | n | agree | missed-close | wrong-Do-It |
|---|---|---|---|---|
| SILENT | 3142 | 99.71% | n/a | 0.29% |
| calendar-cancel|calendar | 10 | 0.00% | 100.00% | n/a |
| calendar-hold|calendar | 27 | 59.26% | 29.63% | n/a |
| commitment|task | 71 | 5.63% | 94.37% | n/a |
| confirmed-amount|task | 114 | 47.37% | 52.63% | n/a |
| dated-commitment|task | 67 | 14.93% | 35.82% | n/a |
| decision|task | 16 | 6.25% | 93.75% | n/a |
| drive-file|file_save | 39 | 0.00% | 100.00% | n/a |
| event|calendar | 161 | 29.19% | 63.35% | n/a |
| follow-up-ask|draft | 464 | 29.09% | 70.69% | n/a |

### By synthetic family (modelVetoV2)

| scenario | n | agree | wrong-Do-It | missed-close |
|---|---|---|---|---|
| ack | 120 | 100.00% | 0.00% | n/a |
| cancelled | 80 | 76.25% | 0.00% | 100.00% |
| commitment_reader | 280 | 51.79% | 0.00% | 63.64% |
| create_doc | 120 | 100.00% | 0.00% | n/a |
| decision | 120 | 51.67% | 0.00% | 53.21% |
| drive_save | 40 | 72.50% | 0.00% | 100.00% |
| file_place | 40 | 82.50% | 0.00% | 100.00% |
| fyi | 200 | 84.00% | 0.00% | 100.00% |
| hedge | 160 | 100.00% | 0.00% | n/a |
| marketing | 80 | 100.00% | 0.00% | n/a |
| meeting | 200 | 74.50% | 0.00% | 57.14% |
| negation | 160 | 83.13% | 0.00% | 100.00% |
| onedrive_save | 160 | 76.25% | 0.00% | 100.00% |
| ooo | 80 | 100.00% | 0.00% | n/a |
| own_commitment_self | 120 | 99.17% | 0.00% | 5.00% |
| past | 200 | 97.50% | 0.00% | 100.00% |
| payment | 80 | 66.25% | 0.00% | 87.10% |
| quoted_forward | 40 | 100.00% | 0.00% | n/a |
| reply_with_file | 80 | 100.00% | 0.00% | n/a |
| request_reply | 520 | 77.69% | 1.67% | 50.00% |
| third_party | 80 | 45.00% | 0.00% | 100.00% |

### gold22 (model-labeled, NOT owner-verified; M0 binary; text-only inbound view)

| mode | Do It precision | silence recall | ASK recall | wrong-Do-It |
|---|---|---|---|---|
| teacher | 50.00% | 95.00% | 50.00% | 5.00% (1/20) |
| teacherV2 | 50.00% | 95.00% | 50.00% | 5.00% (1/20) |
| model | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |
| modelVeto | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |
| modelVetoV2 | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |

### Adversarial (spec labels, not owner-verified)

| mode | correct | failures |
|---|---|---|
| teacher | 26/40 | neg-drive-1(file_save), neg-drive-2(file_save), neg-drive-3(file_save), neg-drive-4(file_save), neg-he-1(file_save), neg-he-2(file_save), od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(draft), mkt-he(calendar), cond-amt(task) |
| teacherV2 | 34/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(draft) |
| model | 31/40 | neg-drive-4(file_save), neg-he-1(file_save), neg-he-2(file_save), od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(SILENT) |
| modelVeto | 31/40 | neg-drive-4(file_save), neg-he-1(file_save), neg-he-2(file_save), od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(SILENT) |
| modelVetoV2 | 34/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(SILENT) |

### Operating points (model + all vetoes, held-out test)

| τ | wrong-Do-It vs teacher | missed-close |
|---|---|---|
| 0.3 | 4.07% (128) | 34.37% |
| 0.4 | 3.12% (98) | 36.64% |
| 0.5 | 2.32% (73) | 40.56% |
| 0.6 | 1.78% (56) | 44.27% |
| 0.7 | 1.40% (44) | 49.23% |
| 0.8 | 1.02% (32) | 54.90% |
| 0.9 | 0.45% (14) | 62.64% |
| 0.95 | 0.29% (9) | 67.39% |

### Every wrong-Do-It (vs teacher) at the shipped τ — for owner adjudication

- `syn-482` outlook teacher=intent-null model=follow-up-ask|draft p=0.96 — Hi there, We still need the CV from you on Monday before we can onboard.
- `syn-483` gmail teacher=intent-null model=follow-up-ask|draft p=1 — Hey, We still need the lease from you by October 15 before we can onboard. Best, Sarah
- `syn-484` outlook teacher=intent-null model=follow-up-ask|draft p=0.98 — We still need the budget spreadsheet from you by Thursday before we can onboard. Thank you!
- `syn-508` gmail teacher=intent-null model=follow-up-ask|draft p=0.98 — Hey, We still need the lease from you before Sunday before we can onboard. Thanks
- `syn-510` gmail teacher=intent-null model=follow-up-ask|draft p=1 — Hi, We still need the lease from you by November 2 before we can onboard. Cheers
- `repo-intent-teacher-eval-188-gmail` gmail teacher=intent-null model=follow-up-ask|draft p=0.98 — אני צריך את המספר הסידורי של הלפטופ, תוכל למצוא ולשלוח?
- `rtest-capture-corpus-50` gmail teacher=intent-null model=follow-up-ask|draft p=1 — Can you send the lease please?
- `rtest-judgment-corpus-1276` gmail teacher=intent-null model=confirmed-amount|task p=0.98 — Suppose we approved the $40,000 for the pilot — would that actually work on your side?
- `rtest-request-types-corpus-1578` gmail teacher=intent-null model=follow-up-ask|draft p=1 — Can you countersign the lease and send it back?

v2 rules silenced 30 teacher shows in test (cost/benefit list in report.json).

## v1c  (show threshold τ=0.96)

### Held-out test (n=4111) vs teacher

| mode | agree (exact) | show/silence agree | **wrong-Do-It** | wrong-Do-It in model-free region | missed-close | wrong action when both show |
|---|---|---|---|---|---|---|
| teacherV2 | 99.27% | 99.27% | **0.00%** (0/3142) | 0.00% (0/2089) | 3.10% (30/969) | 0.00% |
| model | 79.96% | 80.71% | **0.92%** (29/3142) | 1.24% (26/2089) | 78.84% (764/969) | 7.32% |
| modelVeto | 79.88% | 80.64% | **0.83%** (26/3142) | 1.24% (26/2089) | 79.46% (770/969) | 7.54% |
| modelVetoV2 | 79.88% | 80.64% | **0.83%** (26/3142) | 1.24% (26/2089) | 79.46% (770/969) | 7.54% |

### By source (modelVetoV2)

| source | n | agree | wrong-Do-It | missed-close |
|---|---|---|---|---|
| repo | 640 | 90.78% | 0.00% (0/576) | 92.19% (59/64) |
| repo-test-strings | 511 | 82.00% | 0.51% (2/396) | 78.26% (90/115) |
| synthetic | 2960 | 77.16% | 1.11% (24/2170) | 78.61% (621/790) |

### By teacher label (modelVetoV2)

| teacher label | n | agree | missed-close | wrong-Do-It |
|---|---|---|---|---|
| SILENT | 3142 | 99.17% | n/a | 0.83% |
| calendar-cancel|calendar | 10 | 0.00% | 100.00% | n/a |
| calendar-hold|calendar | 27 | 3.70% | 96.30% | n/a |
| commitment|task | 71 | 1.41% | 98.59% | n/a |
| confirmed-amount|task | 114 | 34.21% | 65.79% | n/a |
| dated-commitment|task | 67 | 7.46% | 68.66% | n/a |
| decision|task | 16 | 6.25% | 93.75% | n/a |
| drive-file|file_save | 39 | 2.56% | 97.44% | n/a |
| event|calendar | 161 | 19.88% | 75.78% | n/a |
| follow-up-ask|draft | 464 | 18.97% | 79.31% | n/a |

### By synthetic family (modelVetoV2)

| scenario | n | agree | wrong-Do-It | missed-close |
|---|---|---|---|---|
| ack | 120 | 100.00% | 0.00% | n/a |
| cancelled | 80 | 76.25% | 0.00% | 100.00% |
| commitment_reader | 280 | 50.36% | 0.00% | 81.12% |
| create_doc | 120 | 100.00% | 0.00% | n/a |
| decision | 120 | 39.17% | 0.00% | 66.97% |
| drive_save | 40 | 72.50% | 0.00% | 100.00% |
| file_place | 40 | 82.50% | 0.00% | 100.00% |
| fyi | 200 | 84.00% | 0.00% | 100.00% |
| hedge | 160 | 100.00% | 0.00% | n/a |
| marketing | 80 | 100.00% | 0.00% | n/a |
| meeting | 200 | 61.50% | 0.00% | 91.67% |
| negation | 160 | 83.13% | 0.00% | 100.00% |
| onedrive_save | 160 | 62.50% | 18.03% | 78.95% |
| ooo | 80 | 100.00% | 0.00% | n/a |
| own_commitment_self | 120 | 99.17% | 0.00% | 5.00% |
| past | 200 | 97.50% | 0.00% | 100.00% |
| payment | 80 | 61.25% | 0.00% | 100.00% |
| quoted_forward | 40 | 100.00% | 0.00% | n/a |
| reply_with_file | 80 | 100.00% | 0.00% | n/a |
| request_reply | 520 | 71.15% | 0.67% | 67.27% |
| third_party | 80 | 45.00% | 0.00% | 100.00% |

### gold22 (model-labeled, NOT owner-verified; M0 binary; text-only inbound view)

| mode | Do It precision | silence recall | ASK recall | wrong-Do-It |
|---|---|---|---|---|
| teacher | 50.00% | 95.00% | 50.00% | 5.00% (1/20) |
| teacherV2 | 50.00% | 95.00% | 50.00% | 5.00% (1/20) |
| model | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |
| modelVeto | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |
| modelVetoV2 | 100.00% | 100.00% | 50.00% | 0.00% (0/20) |

### Adversarial (spec labels, not owner-verified)

| mode | correct | failures |
|---|---|---|
| teacher | 26/40 | neg-drive-1(file_save), neg-drive-2(file_save), neg-drive-3(file_save), neg-drive-4(file_save), neg-he-1(file_save), neg-he-2(file_save), od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(draft), mkt-he(calendar), cond-amt(task) |
| teacherV2 | 34/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), od-save-5(draft), od-save-he(draft) |
| model | 35/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), drive-pos(SILENT) |
| modelVeto | 35/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), drive-pos(SILENT) |
| modelVetoV2 | 35/40 | od-save-1(SILENT), od-save-2(SILENT), od-save-3(SILENT), od-save-4(SILENT), drive-pos(SILENT) |

### Operating points (model + all vetoes, held-out test)

| τ | wrong-Do-It vs teacher | missed-close |
|---|---|---|
| 0.3 | 6.14% (193) | 30.75% |
| 0.4 | 4.96% (156) | 34.06% |
| 0.5 | 4.01% (126) | 40.66% |
| 0.6 | 2.96% (93) | 46.23% |
| 0.7 | 2.13% (67) | 52.73% |
| 0.8 | 1.56% (49) | 59.75% |
| 0.9 | 1.18% (37) | 69.14% |
| 0.95 | 0.99% (31) | 77.40% |

### Every wrong-Do-It (vs teacher) at the shipped τ — for owner adjudication

- `syn-483` gmail teacher=intent-null model=follow-up-ask|draft p=0.98 — Hey, We still need the lease from you by October 15 before we can onboard. Best, Sarah
- `syn-510` gmail teacher=intent-null model=follow-up-ask|draft p=0.98 — Hi, We still need the lease from you by November 2 before we can onboard. Cheers
- `syn-3447` outlook teacher=intent-null model=drive-file|file_save p=0.97 — Hi there, Attached is the receipt. Please save the attached file to OneDrive by Oct 20. Thanks
- `syn-3476` outlook teacher=intent-null model=drive-file|file_save p=0.97 — Hello, Attached is the budget spreadsheet. Please save the attached file to OneDrive by October 15. Regards, Dana
- `syn-3481` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Hi, Please save the attachment to OneDrive. Thanks
- `syn-3482` outlook teacher=intent-null model=drive-file|file_save p=0.96 — Good morning, Please save the attachment to OneDrive. Cheers
- `syn-3496` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Hi there, Please save the attachment to OneDrive. Regards, David
- `syn-3497` outlook teacher=intent-null model=drive-file|file_save p=0.97 — Hello, Please save the attachment to OneDrive. Regards, Noa
- `syn-3498` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Hi, Please save the attachment to OneDrive. Thank you!
- `syn-3499` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Please save the attachment to OneDrive. Best, Michael
- `syn-3505` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Please save the attachment to OneDrive. Cheers
- `syn-3506` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Hey, Please save the attachment to OneDrive.
- `syn-3511` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Hi Sali, Please save the attachment to OneDrive. Thanks
- `syn-3516` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Please save the attachment to OneDrive. Thanks, Ethan
- `syn-3761` outlook teacher=intent-null model=drive-file|file_save p=0.97 — Hi, Please save this attachment to OneDrive. Regards, Lior
- `syn-3768` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Hi, Hope you are well. Please save this attachment to OneDrive. Thanks, David
- `syn-3770` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Hi Sali, Please save this attachment to OneDrive. Thanks
- `syn-3771` outlook teacher=intent-null model=drive-file|file_save p=0.98 — Please save this attachment to OneDrive. Regards, Lior
- `syn-3772` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Please save this attachment to OneDrive. Thanks
- `syn-3774` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Please save this attachment to OneDrive.
- `syn-3775` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Please save this attachment to OneDrive. Thank you!
- `syn-3778` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Hi Sali, Please save this attachment to OneDrive. Thanks
- `syn-3783` outlook teacher=intent-null model=drive-file|file_save p=0.99 — Please save this attachment to OneDrive. Thank you!
- `syn-3784` outlook teacher=intent-null model=drive-file|file_save p=1 — Please save this attachment to OneDrive.
- `rtest-capture-corpus-50` gmail teacher=intent-null model=follow-up-ask|draft p=0.99 — Can you send the lease please?
- `rtest-request-types-corpus-1578` gmail teacher=intent-null model=follow-up-ask|draft p=0.98 — Can you countersign the lease and send it back?

v2 rules silenced 30 teacher shows in test (cost/benefit list in report.json).

