# Ecosystem runs

Glance closes open loops. Gmail is where it starts today.

One short report per run of the ecosystems builder. Newest last. Status only; a Live Gate stays "not run" until the owner records one.

## 2026-10-20 (Ecosystems builder A) — Google Meet link on a hold

- **Capability shipped (logic, switch off):** a mail that proposes a video call with one day and one clock ("Can we do a video call tomorrow at 15:00?", "נעשה שיחת וידאו מחר ב-15:00") gets one Do It that creates a Google Calendar event with a real Meet link. No guest is added and `sendUpdates=none`, so nothing is sent. Handled only when the read-back by id shows the same title, both instants and a created `meet.google.com` link; otherwise the event is withdrawn. Undo deletes it and refuses after the person edited it. Module `flow-trial-extension/core/meet-link.js`, switch `MEET_LINK`. No new scope (`calendar.events` allows `conferenceData`).
- **Not user-visible yet:** the module is not wired into `src/` and its card is requested for the Grok bot (`card-requests-2026-10-20.md`, M1). So this run ships tested logic, not a card a person can click. Counted honestly as a partial run against the "user-facing capability" bar.
- **Tests:** `test/meet-link-corpus.cjs` (recognition 8 clear, 16 silent, plan, write, pending link, failed link, wrong title or time, guest, wrong account, auth, Undo untouched, edited, deleted). Whole regression of every `test/*corpus.cjs`: green after the docs map row.
- **Open:** wire to the Gmail card behind the switch once the card exists; add a Meet link to an existing event; live Gate; Outlook equivalent (Teams meeting link) is the next gap.

## 2026-10-20 (Ecosystems builder B) — Teams meeting link on a hold

- **Capability shipped (logic, switch off):** an Outlook mail that proposes a call (generic "video call" or a named Teams call, one day, one clock; English and Hebrew) gets one Do It that creates an Outlook calendar event with a Teams join link. No guest, so nothing is sent. Handled only when the read-back by id shows the same subject, the same wall clock and a `teams.microsoft.com` or `teams.live.com` join link; otherwise the event is withdrawn. Undo deletes it and refuses when the person edited, moved or invited someone. Module `flow-trial-extension/core/teams-meeting.js`, switch `TEAMS_MEETING`, proof system `microsoft/calendar`. No new scope (`Calendars.ReadWrite` is the existing Calendar box).
- **Not user-visible yet:** like builder A's Meet link, the module is not wired into `src/content-outlook.js`, and its card is requested for the Grok bot (`card-requests-2026-10-20.md`, T1). Tested logic, not a card a person can click: a partial run against the user-facing bar.
- **Tests:** `test/teams-meeting-corpus.cjs` (8 clear lines, 15 silent with reasons, plan, write, late link, no link, bad link, wrong subject or time, guest, wrong account, missing scope, auth, Undo untouched, edited, moved, guest, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wire to the Outlook card behind the switch once T1 exists; live Gate; personal Microsoft accounts may return no join link (then withdrawn); next gaps: Word or Excel from a request with no attachment (row 76), SharePoint, Planner, WhatsApp follow-ups.

## 2026-10-20 (Ecosystems builder A, second run) — Doc or Sheet from a request

- **Capability shipped (logic, switch off):** "Can you create a shared doc called Q4 launch plan?" / "תפתח בבקשה מסמך בשם ..." gets one Do It that creates an empty native Google Doc or Sheet in the person's Drive. Glance writes no content and shares nothing. Handled only after a read-back by id shows the name, the Doc or Sheet type and not trashed; Undo trashes it only while version and modifiedTime are unchanged. `core/workspace-file.js`, switch `WORKSPACE_FILE`. No new scope (`drive.file`).
- **Not user-visible yet:** not wired into `src/`; card ask W1 is in `card-requests-2026-10-20.md`. Logic only, so a partial run against the user-facing bar.
- **Tests:** `test/workspace-file-corpus.cjs` (9 clear in English and Hebrew, 12 silent with reasons, ignored lines, plan, create for Doc and Sheet, mismatched name or type, trashed, cannot withdraw, auth, Undo untouched, edited, no snapshot, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wiring behind the Gmail card; Word and Excel equivalents on OneDrive (same shape, `Files.ReadWrite`); Planner and SharePoint; live Gate. Teams meeting link was built by the run before this one.

## 2026-10-20 (Ecosystems builder B, second run) — Word or Excel from a request

- **Capability shipped (logic, switch off):** an Outlook mail that explicitly asks for a new document, tracker or sheet with a name and no attachment ("Can you create a Word document called Supplier onboarding?", "תפתח בבקשה מסמך בשם הצעת מחיר") gets one Do It that creates an empty `.docx` or `.xlsx` in OneDrive > Glance. Glance writes no content and shares nothing; a taken name is refused, never replaced. Handled only after the read-back by id shows name, a file, a size above zero and not deleted; otherwise it is removed again. Undo deletes it and refuses when eTag or lastModifiedDateTime changed. Module `flow-trial-extension/core/onedrive-new-file.js`, switch `ONEDRIVE_NEW_FILE`, proof systems `microsoft/word` and `microsoft/excel`. No new scope (`Files.ReadWrite`, the OneDrive box). Closes row 76 part 8 as logic.
- **Not user-visible yet:** not wired into `src/content-outlook.js`; card ask W2 is in `card-requests-2026-10-20.md`. Logic only, so a partial run against the user-facing bar, like the three before it. Every ecosystems run so far has ended at "needs the Grok card"; the wiring behind each switch is now the larger open item.
- **Tests:** `test/onedrive-new-file-corpus.cjs` (9 clear in English and Hebrew, 15 silent with reasons, ignored lines, plan, real zip uploaded for .docx and .xlsx, name taken, wrong name, folder, empty upload, withdrawal fails, scope, auth, Undo untouched, edited, no stamp, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wiring the four switches (`MEET_LINK`, `TEAMS_MEETING`, `WORKSPACE_FILE`, `ONEDRIVE_NEW_FILE`) behind their cards; live Gates; "annual review" style topics are silent because `review` reads as an existing-file verb (conservative, inherited from the Google twin); next gaps: SharePoint, Planner, WhatsApp and Messenger follow-ups.

## 2026-10-21 (Ecosystems builder A, third run) — Microsoft Planner task

- **Capability shipped (logic, switch off):** "Please add the task 'Send contract to Dana' to the Website relaunch plan by Friday" / "תוסיף משימה ... לתוכנית ..." gets one Do It that creates a Planner task in that plan, assigned to no one (nobody is notified), with the date when the mail gave one. The plan must be named and be exactly one of the person's plans. Handled only after a read-back by id shows title, plan and date; Undo deletes with If-Match and refuses after the entity tag moved. `core/planner-task.js`, switch `PLANNER_TASK`. No new scope (`Tasks.ReadWrite`, already requested for To Do).
- **Not user-visible yet:** not wired into `src/`; card ask P1 is in `card-requests-2026-10-20.md`. Logic only, a partial run against the user-facing bar.
- **Tests:** `test/planner-task-corpus.cjs` (6 clear in English and Hebrew, 7 silent with reasons, ignored lines, unknown and ambiguous plan, create, mismatched title, plan and date, assignee, cannot withdraw, auth, Undo untouched, etag moved, no etag, deleted). Whole regression of every `test/*corpus.cjs` run before the commit.
- **Open:** wiring and the plans listing in the host; bucket choice; SharePoint is the next gap; Entra must list `Tasks.ReadWrite` (row 44); live Gate.
