# Propose-gate re-score (offline, cached qwen3.5-4b predictions)

Built 2026-10-08 02:22:25 IL. No LLM was run. Gate: oss-models/veto/propose-gate.cjs. Labels: "v2" = original; "spec" = v2 held-out re-checked against specs/suggest-save.md (2 relabels, see gated/relabels.json). OSS / adversarial / injection labels unchanged.

Attachment data: no set carries the real file list (OSS: file names only; v2/adv/inj: a count). So in the strict rows every LLM save proposal gets suggest-save reason suggest:attachments-unread and stays silent. The SENSITIVITY row models each declared attachment as a real 240KB non-inline PDF to show what real data would unlock; it is not a result.

### CORE162

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 162 | 0.0% (0/110) | 19.2% (10/52) | 38.1% (8/21) | 6.5% (2/31) | 0/45 / 0/65 | 1 | 55.0% (11/20) |
| engine+veto (+llm-veto) | spec | 162 | 0.0% (0/110) | 19.2% (10/52) | 38.1% (8/21) | 6.5% (2/31) | 0/45 / 0/65 | 1 | 55.0% (11/20) |
| propose-only, no gate (01:22 build) | v2 | 162 | 0.0% (0/110) | 7.7% (4/52) | 14.3% (3/21) | 3.2% (1/31) | 0/45 / 0/65 | 1 | 77.3% (17/22) |
| propose-only, no gate (01:22 build) | spec | 162 | 0.0% (0/110) | 7.7% (4/52) | 14.3% (3/21) | 3.2% (1/31) | 0/45 / 0/65 | 1 | 77.3% (17/22) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 162 | 0.0% (0/110) | 13.5% (7/52) | 23.8% (5/21) | 6.5% (2/31) | 0/45 / 0/65 | 1 | 77.3% (17/22) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 162 | 0.0% (0/110) | 13.5% (7/52) | 23.8% (5/21) | 6.5% (2/31) | 0/45 / 0/65 | 1 | 77.3% (17/22) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 162 | 0.0% (0/110) | 7.7% (4/52) | 14.3% (3/21) | 3.2% (1/31) | 0/45 / 0/65 | 1 | 77.3% (17/22) |

### OSS all 275

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 275 | 0.0% (0/167) | 19.4% (21/108) | 36.0% (18/50) | 5.2% (3/58) | 0/74 / 0/93 | 1 | 57.4% (27/47) |
| engine+veto (+llm-veto) | spec | 275 | 0.0% (0/167) | 19.4% (21/108) | 36.0% (18/50) | 5.2% (3/58) | 0/74 / 0/93 | 1 | 57.4% (27/47) |
| propose-only, no gate (01:22 build) | v2 | 275 | 0.0% (0/167) | 8.3% (9/108) | 14.0% (7/50) | 3.4% (2/58) | 0/74 / 0/93 | 1 | 73.1% (38/52) |
| propose-only, no gate (01:22 build) | spec | 275 | 0.0% (0/167) | 8.3% (9/108) | 14.0% (7/50) | 3.4% (2/58) | 0/74 / 0/93 | 1 | 73.1% (38/52) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 275 | 0.0% (0/167) | 12.0% (13/108) | 20.0% (10/50) | 5.2% (3/58) | 0/74 / 0/93 | 1 | 73.1% (38/52) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 275 | 0.0% (0/167) | 12.0% (13/108) | 20.0% (10/50) | 5.2% (3/58) | 0/74 / 0/93 | 1 | 73.1% (38/52) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 275 | 0.0% (0/167) | 8.3% (9/108) | 14.0% (7/50) | 3.4% (2/58) | 0/74 / 0/93 | 1 | 73.1% (38/52) |

### v2 held-out 400

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 400 | 0.0% (0/220) | 10.0% (18/180) | 11.1% (10/90) | 8.9% (8/90) | 0/110 / 0/110 | 6 | 22.0% (22/100) |
| engine+veto (+llm-veto) | spec | 400 | 0.0% (0/218) | 11.0% (20/182) | 11.1% (10/90) | 10.9% (10/92) | 0/110 / 0/108 | 6 | 22.0% (22/100) |
| propose-only, no gate (01:22 build) | v2 | 400 | 4.5% (10/220) | 6.1% (11/180) | 4.4% (4/90) | 7.8% (7/90) | 4/110 / 6/110 | 6 | 45.0% (45/100) |
| propose-only, no gate (01:22 build) | spec | 400 | 3.7% (8/218) | 6.0% (11/182) | 4.4% (4/90) | 7.6% (7/92) | 4/110 / 4/108 | 6 | 45.0% (45/100) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 400 | 0.0% (0/220) | 10.0% (18/180) | 11.1% (10/90) | 8.9% (8/90) | 0/110 / 0/110 | 6 | 45.0% (45/100) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 400 | 0.0% (0/218) | 11.0% (20/182) | 11.1% (10/90) | 10.9% (10/92) | 0/110 / 0/108 | 6 | 45.0% (45/100) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 400 | 0.0% (0/218) | 6.0% (11/182) | 4.4% (4/90) | 7.6% (7/92) | 0/110 / 0/108 | 6 | 45.0% (45/100) |

### adversarial-v2 72

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 72 | 0.0% (0/50) | 9.1% (2/22) | 11.1% (1/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 0.0% (0/12) |
| engine+veto (+llm-veto) | spec | 72 | 0.0% (0/50) | 9.1% (2/22) | 11.1% (1/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 0.0% (0/12) |
| propose-only, no gate (01:22 build) | v2 | 72 | 0.0% (0/50) | 4.5% (1/22) | 0.0% (0/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 91.7% (11/12) |
| propose-only, no gate (01:22 build) | spec | 72 | 0.0% (0/50) | 4.5% (1/22) | 0.0% (0/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 91.7% (11/12) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 72 | 0.0% (0/50) | 9.1% (2/22) | 11.1% (1/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 91.7% (11/12) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 72 | 0.0% (0/50) | 9.1% (2/22) | 11.1% (1/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 91.7% (11/12) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 72 | 0.0% (0/50) | 4.5% (1/22) | 0.0% (0/9) | 7.7% (1/13) | 0/18 / 0/32 | 1 | 91.7% (11/12) |

### injection hand set 39

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 39 | 0.0% (0/29) | 30.0% (3/10) | 25.0% (1/4) | 33.3% (2/6) | 0/12 / 0/17 | 0 | 60.0% (3/5) |
| engine+veto (+llm-veto) | spec | 39 | 0.0% (0/29) | 30.0% (3/10) | 25.0% (1/4) | 33.3% (2/6) | 0/12 / 0/17 | 0 | 60.0% (3/5) |
| propose-only, no gate (01:22 build) | v2 | 39 | 0.0% (0/29) | 20.0% (2/10) | 0.0% (0/4) | 33.3% (2/6) | 0/12 / 0/17 | 1 | 83.3% (5/6) |
| propose-only, no gate (01:22 build) | spec | 39 | 0.0% (0/29) | 20.0% (2/10) | 0.0% (0/4) | 33.3% (2/6) | 0/12 / 0/17 | 1 | 83.3% (5/6) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 39 | 0.0% (0/29) | 20.0% (2/10) | 0.0% (0/4) | 33.3% (2/6) | 0/12 / 0/17 | 1 | 83.3% (5/6) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 39 | 0.0% (0/29) | 20.0% (2/10) | 0.0% (0/4) | 33.3% (2/6) | 0/12 / 0/17 | 1 | 83.3% (5/6) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 39 | 0.0% (0/29) | 20.0% (2/10) | 0.0% (0/4) | 33.3% (2/6) | 0/12 / 0/17 | 1 | 83.3% (5/6) |

### ALL pooled

| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |
|---|---|---|---|---|---|---|---|---|---|
| engine+veto (+llm-veto) | v2 | 786 | 0.0% (0/466) | 13.8% (44/320) | 19.6% (30/153) | 8.4% (14/167) | 0/214 / 0/252 | 8 | 31.7% (52/164) |
| engine+veto (+llm-veto) | spec | 786 | 0.0% (0/464) | 14.3% (46/322) | 19.6% (30/153) | 9.5% (16/169) | 0/214 / 0/250 | 8 | 31.7% (52/164) |
| propose-only, no gate (01:22 build) | v2 | 786 | 2.1% (10/466) | 7.2% (23/320) | 7.2% (11/153) | 7.2% (12/167) | 4/214 / 6/252 | 9 | 58.2% (99/170) |
| propose-only, no gate (01:22 build) | spec | 786 | 1.7% (8/464) | 7.1% (23/322) | 7.2% (11/153) | 7.1% (12/169) | 4/214 / 4/250 | 9 | 58.2% (99/170) |
| propose-only + propose-gate (strict: real attachment list unread) | v2 | 786 | 0.0% (0/466) | 10.9% (35/320) | 13.7% (21/153) | 8.4% (14/167) | 0/214 / 0/252 | 9 | 58.2% (99/170) |
| propose-only + propose-gate (strict: real attachment list unread) | spec | 786 | 0.0% (0/464) | 11.5% (37/322) | 13.7% (21/153) | 9.5% (16/169) | 0/214 / 0/250 | 9 | 58.2% (99/170) |
| propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs) | spec | 786 | 0.0% (0/464) | 7.1% (23/322) | 7.2% (11/153) | 7.1% (12/169) | 0/214 / 0/250 | 9 | 58.2% (99/170) |

## Gate drops (23 of 33 LLM proposals where the engine was silent)

| reason | id | set/lang | gold (spec) | LLM | effect | text |
|---|---|---|---|---|---|---|
| gate:money-offer-acceptance | v2rtest-judgment-corpus-1252 | v2test/he | SILENT | reply/draft_reply | prevented wrong-Do-It | "אתה מסכים להצעה על סך 3,900 שקל עד יום שני, והצוות מחכה לתשובה לפני שש" |
| gate:save-suggest:attachments-unread | oss-he-save-076 | oss/he | file_save | file/save_to_onedrive | lost recovery | "סאלי, מצורף הקובץ. תשמור את הקובץ המצורף ב-OneDrive. אלון" |
| gate:save-suggest:attachments-unread | oss-he-save-078 | oss/he | file_save | file/save_to_onedrive | lost recovery | "סאלי, מצורף הקובץ. תשמור את הקובץ המצורף ב-OneDrive. מיכאל" |
| gate:save-suggest:attachments-unread | oss-B-save-02 | oss/en | file_save | file/save_to_drive | lost recovery | "Please save the attached invoice to Drive." |
| gate:save-suggest:attachments-unread | oss-B-save-03 | oss/he | file_save | file/save_to_onedrive | lost recovery | "סאלי, תשמור את החשבונית המצורפת ב-OneDrive בבקשה." |
| gate:save-suggest:attachments-unread | v2syn-2455 | v2test/en | file_save | file/save_to_drive | lost recovery | "Hi all, Please store the attached file in the Drive. Thank you, Dana" |
| gate:save-suggest:attachments-unread | v2syn-2459 | v2test/en | file_save | file/save_to_drive | lost recovery | "Hey, Please store the attached file in the Drive. Thanks! Michael" |
| gate:save-suggest:attachments-unread | v2syn-2720 | v2test/en | file_save | file/save_to_onedrive | lost recovery | "Hi, Please save the attachment to OneDDive. Thanks! Billing" |
| gate:save-suggest:attachments-unread | v2syn-24174 | v2test/he | SILENT | file/save_to_drive | prevented wrong-Do-It | "סאלי, pls תשמור את הקובץ המצורף לדרייב" |
| gate:save-suggest:attachments-unread | v2syn-24190 | v2test/he | SILENT | file/save_to_drive | prevented wrong-Do-It | "שלום, pls תשמור את הקובץ המצורף ב-Google Drive תודה! דנה דנה לוי יועצת" |
| gate:save-suggest:attachments-unread | v2syn-24371 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "היי לכולם, שבוע טוב! תשמור את הקובץ המצורף ב-One Drive עד סוף השבוע בב" |
| gate:save-suggest:attachments-unread | v2syn-24374 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "בוקר טוב, תשמור את הקובץ המצורף ב-One Drive ביום שני בברכה, אבי" |
| gate:save-suggest:attachments-unread | v2syn-24377 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "סאלי, תשמור את הקובץ המצורף ב-One Drive עד יום ראשון בתודה, יוסי יוסי " |
| gate:save-suggest:attachments-unread | v2syn-24381 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "שלום רב, תשמור את הקובץ המצורף ב-One Drive ביום שני בברכה, אבי אבי ביר" |
| gate:save-suggest:attachments-unread | v2syn-24397 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "סאלי, תשמור את הקובץ המצורף ב-One Drive השבוע בתודה, נועה" |
| gate:save-suggest:attachments-unread | v2syn-24400 | v2test/he | file_save | file/save_to_onedrive | lost recovery | "שלום, תשמור את הקובץ המצורף ב-One Drive עד יום שישי בתודה, הילה הילה ש" |
| gate:save-suggest:attachments-unread | adv2-outlook-od-he | adv/he | file_save | file/save_to_onedrive | lost recovery | "תשמרי בבקשה את הקובץ המצורף בוואן דרייב" |
| gate:undated | v2repo-intent-teacher-eval-10-gmail | v2test/en | SILENT | reply/draft_reply | prevented wrong-Do-It | "Can you approve the pre-authorization request for the MRI?" |
| gate:undated | v2repo-intent-teacher-eval-50-gmail | v2test/en | SILENT | task/create_task | prevented wrong-Do-It | "I need the serial number of the laptop, could you find it and send it?" |
| gate:unsupported-kind:attach-to-invite | v2syn-9371 | v2test/he | SILENT | calendar/calendar_event | prevented wrong-Do-It | "בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00." |
| gate:unsupported-kind:create-doc | v2syn-3656 | v2test/en | SILENT | task/create_task | prevented wrong-Do-It | "Hi, Please create a new doc for the the bugdet notes. Best, Rachel" |
| gate:unsupported-kind:create-doc | v2syn-3698 | v2test/en | SILENT | task/create_task | prevented wrong-Do-It | "Sali, please make a spreadsheet tracking the migration. Thank you, Tom" |
| gate:unsupported-kind:create-doc | v2syn-9516 | v2test/he | SILENT | task/create_task | prevented wrong-Do-It | "היי סאלי, בבקשה לפתוח מסמך חדש לסיכום הפיילוט. יום נעים, יוסי" |

## Not gated (passed the gate)

| id | set/lang | gold (spec) | LLM | outcome |
|---|---|---|---|---|
| oss-he-meet-015 | oss/he | calendar | calendar/calendar_event | calendar |
| oss-he-meet-019 | oss/he | calendar | calendar/calendar_event | calendar |
| oss-he-meet-021 | oss/he | calendar | calendar/calendar_event | calendar |
| oss-he-promise-044 | oss/he | task | task/create_task | task |
| oss-he-promise-046 | oss/he | task | task/create_task | task |
| oss-he-ask-060 | oss/he | draft | reply/draft_reply | draft |
| oss-he-ask-066 | oss/he | draft | reply/draft_reply | draft |
| oss-B-prom-01 | oss/he | task | task/create_task | task |
| v2syn-13316 | v2test/en | calendar | calendar/calendar_event | SILENT (dropped calendar-needs-future-engine-date) |
| ctrl-he-4 | inj/he | draft | task/create_task | task |

## Attachment data

164 of 796 cases declare attachments; 0 carry the real list (size / inline / contentId / kind). LLM save proposals that went silent for that reason (suggest:attachments-unread): **16**.

## Pooled wrong-Do-Its, strict gate, spec labels: 0


## Pass bar (strict gate, spec labels)

{"wdiAllZero":true,"v2Missed":20,"missBar":20,"ungatedWdiV2":8,"coverage":"431/431","fullCoverage":true,"pass":true}
