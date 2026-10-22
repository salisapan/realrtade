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

## 2026-10-21 (Ecosystems builder B, third run) — Teams link on the live Outlook Hold It

- **Capability shipped (live path, switch off):** the first ecosystems work that touches a path a person can already click. The Outlook meeting card's existing Hold It, for a mail that asks for a video or Teams call, now creates the event with a Teams join link when `glanceSwitches.TEAMS_MEETING` is true. No guest. The link is read back by id; if none shows after five reads the event is deleted and no Handled is returned. The receipt reads `Calendar · <title> · <when> · Teams` and `joinUrl` comes back for the card. Default off, no UI turns it on, so a user sees no change today.
- **Hazard found and fixed:** Microsoft appends a join block to an online meeting's body, sometimes after Glance's snapshot. `src/native-edit.js` hashed the body text, so Undo would have refused a fresh, untouched event as "you edited this". The block (from its underscore rule to the end) is now left out of the comparison; a person's own agenda above it still reads as an edit.
- **Tests:** `test/teams-wiring-corpus.cjs` (block arriving late, block in Hebrew, edit above the block, a long rule without Teams words stays the person's, 4 call asks and 8 non-asks, switch missing, false and on, late link, no link, foreign link, write-path order: refusal before Teams fields, delete on no link, snapshot after link). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** a Copy control for the link (card ask T1); a way for the owner to turn the switch on for the live Gate; live Gate; the same wiring for `MEET_LINK`, `WORKSPACE_FILE`, `ONEDRIVE_NEW_FILE`, `PLANNER_TASK` (each needs the Gmail or Outlook card path read first). Not a user-visible release: default off.

## 2026-10-21 (Ecosystems builder A, fourth run) — Google Slides deck from a request

- **Capability shipped (logic, switch off):** "Can you create a slide deck called Board update Q4?" / "תפתח בבקשה מצגת בשם ..." gets one Do It that creates an empty native Google Slides deck in the person's Drive (same module and switch as Doc and Sheet). Nothing is written or shared. Handled only after a read-back by id shows name, presentation type and not trashed; Undo trashes it only while version and modifiedTime are unchanged. `core/workspace-file.js`, switch `WORKSPACE_FILE`. No new scope (`drive.file`).
- **Also fixed in the same module:** a word inside the name the person gave ("Board update Q4", "Latest pricing update") no longer counts as "update the existing file", and a Hebrew name stops before a conjoined verb ("... ותכתוב").
- **Not user-visible yet:** not wired into `src/`; card ask W1 now covers decks. A small run: this is a partial against the user-facing bar.
- **Tests:** `test/workspace-file-corpus.cjs` extended (decks in both languages, PowerPoint stays silent, names containing "update" or "latest", deck create and plan). Whole regression of every `test/*corpus.cjs`: green.
- **Open / blocked on the owner:** see `open-tasks.md` row 79 (SharePoint scope, Forms scope, no true Undo for an Outlook invite reply). Next buildable gaps: wiring the built modules behind the Gmail and Outlook cards once the Grok bot delivers designs; Facebook Pages and Threads (page-driven, no API).

## 2026-10-21 (Ecosystems builder B, fourth run) — no user-facing capability

- **Failed run against the user-facing bar, said plainly:** nothing a person can click changed. The Microsoft modules left (Planner task, Word or Excel from a request) have no existing card path to piggyback on the way the Teams link did on the meeting Hold It, so wiring them would need a new card, which belongs to the Grok bot. Facebook Pages, Threads and the WhatsApp Business API need the owner's Meta setup or a new surface. SharePoint, Forms and an Outlook invite reply are blocked on the owner (row 79).
- **Done:** wrote the exact owner procedure for turning `TEAMS_MEETING` on and off for a live Gate round (Microsoft section of `ecosystem-coverage.md`), so the one wired path can actually be tried. Docs only; no code changed since the last full regression, which was green.
- **Open:** the Grok cards (T1, M1, W1, W2, plus Planner); the live Gate for the Teams link; then wiring each remaining module behind its card. Graphify not run.

## 2026-10-21 (Ecosystems builder A, fifth run) — Meet link on the live Gmail Hold It

- **Capability shipped (live path, switch off):** when `glanceSwitches.MEET_LINK` is on and the open mail proposes a video call (Hebrew or English, not Zoom/Teams, not a hedge or a third party), the existing Gmail Hold It also asks Google for a Meet link on the same event. No guest is added and `sendUpdates=none` stays, so nobody is invited. Handled only when the hold's own read-back passes and the event read by id carries a created `meet.google.com` link; with no link the event is deleted and nothing is claimed. Undo is the hold's own and refuses after an edit. The hold module `core/google-calendar.js` is untouched (open PR #152 edits it): the link is added by wrapping the http function (`FlowMeetLink.withMeet`, `holdWithMeet`), wired in `src/google-lane-host.js`; `src/content-gmail.js` passes the mail text (capped at 1500 characters, local) to the worker.
- **User-visible when:** the owner turns the switch on. The result carries `meetUrl`/`joinUrl` and the receipt ends `· Meet`; showing the link in the card is the Grok bot's job (card ask M1 updated). Live Gate: not run; owner procedure is in the `open-tasks.md` header line.
- **Tests:** `test/meet-wiring-corpus.cjs` (call check, conference request with no guest, pending then ready, no link and delete, delete fails, foreign host link, impossible date, Undo unedited and edited, worker wiring checks, manifest unchanged). Whole regression of every `test/*corpus.cjs`: green.
- **Open:** live Gate; showing the link on the card; adding a Meet link to an existing event; the Outlook side already has Teams.

## 2026-10-21 (Ecosystems builder B, fifth run) — no user-facing capability

- **Failed run against the user-facing bar, said plainly.** I looked for a Meta gap I could close without a new card and picked the Messenger and Instagram identity miss in `open-tasks.md` row 71 (a one-to-one chat whose Block control has the same words in its label and text staying quiet). Measured on jsdom fixtures, it does not reproduce: the chat already drafts, old code and a candidate fix behave the same. I reverted the candidate change rather than ship a no-op.
- **Done:** `test/chat-person-control-corpus.cjs` pins the real behavior (same words twice drafts in English and Hebrew; another person's control, a bare Mute, a two-name title, a group word and a members list stay quiet). Row 71 now says so. Whole regression: see commit.
- **Still the real blocker:** every remaining buildable module (Planner, Word/Excel from a request, Docs/Sheets/Slides from a request) needs a card the Grok bot has not delivered; the two paths that could piggyback on an existing card (Teams and Meet links on Hold It) are wired and waiting for a live Gate. Graphify not run.

## 2026-10-21 (Ecosystems builder A, sixth run) — recurring reminder on Google Calendar

- **Capability shipped (logic, switch off):** "Please send me the weekly sales report every Monday at 9:00", "Send the VAT summary on the 15th of each month at 10:00", "בבקשה תשלח את הדוח כל יום ראשון ב-9:00" get one Do It that creates one recurring Google Calendar event: no guest, a popup at the start, first start on the next matching day, rule limited to daily, weekdays, one weekday, or one day of the month (1 to 28). Handled only after a read-back by id shows title, first start and the same rule; a single event or another rule is deleted again. Undo deletes the whole series only while title, note, start, rule and guests are unchanged. The ask is not marked closed (each occurrence is the person's to do). `core/recurring-reminder.js`, switch `RECURRING_REMINDER`. No new scope. Map row T1.
- **Not user-visible yet:** not wired into `src/`; card ask T1 is in `card-requests-2026-10-20.md`. Logic only, so a partial run against the user-facing bar.
- **Tests:** `test/recurring-reminder-corpus.cjs` (8 clear in English and Hebrew, 15 silent with reasons, ignored lines, plan, create, mismatched title, rule, start, guests, cannot withdraw, auth, rule allow-list, Undo untouched, note added, day moved, guest added, deleted). Whole regression of every `test/*corpus.cjs` run before the commit.
- **Open:** wiring behind a card; time-of-day reminder lead time is fixed at the start; "every other week" and quarterly are deliberately silent; live Gate.

## 2026-10-21 (Ecosystems builder B, sixth run) — repeating To Do task on the existing Outlook card

- **Capability shipped (live path, switch off):** the second ecosystems change on a path a person can already click, and the first that needed no card change. When `glanceSwitches.RECURRING_TODO` is true and a mail states one repeat rule and one clock ("send the sales report every Monday at 9:00", "on the 15th of each month", "כל יום שני ב-9:00"), the existing Outlook To Do Do It makes the task a repeating one: Graph `recurrence`, the first occurrence as the due date, a reminder at the clock. Handled only when the task read back carries the same rule; otherwise it is the existing unverified branch. The receipt ends `· repeats`. Default off, no UI turns it on, so a user sees no change today.
- **Undo kept honest:** the repeat rule is now part of `src/native-edit.js`'s snapshot, so a person moving the task to Tuesday or removing the repeat reads as an edit and Undo leaves it alone. A one-off task is unchanged. Found by the test: Graph spells a weekly rule with `dayOfMonth: 0`; zero is treated as empty so the same rule compares equal.
- **Tests:** `test/todo-recurrence-corpus.cjs` (5 repeat lines in both languages, 9 silences, rule mapping, Graph's fuller spelling, snapshot and edit cases, switch gating and read-back with stubs, write-path source checks). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** one live read of Graph's To Do `recurrence` (spelling assumed from the docs); live Gate; the Google twin (`RECURRING_REMINDER`, builder A) is still logic-only. Graphify not run.

## 2026-10-21 (Ecosystems builder A, seventh run) — Meet link on an existing event

- **Capability shipped (logic, switch off):** "Can you add a Meet link to the Thursday sync?" / "תוסיף קישור למיט לישיבת צוות" gets one Do It that puts a Google Meet link on the one calendar event the person organizes that fits (by the day named, or its words), has no call link, is not cancelled and not past. Only the conference request is patched (`sendUpdates=none`); the guest list and text are not touched. Handled only after a read-back by id shows a created `meet.google.com` link and title, start and guests unchanged; Undo removes only the conference and refuses after the person changed anything else or the link. `core/event-call-link.js`, switch `EVENT_CALL_LINK`. No new scope.
- **Not user-visible yet:** not wired into `src/`; card ask M2 is in `card-requests-2026-10-20.md`. Logic only, a partial run against the user-facing bar. A known limit of word matching (shared with the RSVP module): naming a cancelled event can match another event that shares a word; a day or a second word narrows it, and several matches stay silent.
- **Tests:** `test/event-call-link-corpus.cjs` (5 offers in English and Hebrew, 5 silent with reasons, 7 event-choice cases, patch shape, pending link, no link, foreign host link, event changed, own link added, not the person's event, auth, Undo untouched, agenda added, guest added, link swapped, no hash, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wiring behind a card; the Outlook twin (Teams link on an existing event); live Gate.

## 2026-10-21 (Ecosystems builder B, seventh run) — no new capability; the wired paths were run in a real browser

- **Failed run against the user-facing bar, said plainly:** no new capability. Every buildable module left needs a Grok card or an owner scope (row 79), and I did not add another unwired module.
- **What I did instead:** ran the headless unpacked-extension suite (`npx playwright test`, 284 specs) for the first time from an ecosystems run, to check that the service worker still loads with the imports added for the Teams link and the repeating To Do, and that the To Do path (`proof-of-close`, `steps-list`, `scenario-a`) still reads back and undoes. Result: 279 pass. The 5 that fail fail identically at 6ed3bf1, before any of this wiring (Outlook self-sent/Hebrew meeting in `engine.spec.js:278`; Calendar Hold It, Calendar Undo after edit, Sheets append and Sheets Undo after edit in `google-lane-http.spec.js`), so they are not from it. Logged in `open-tasks.md` for whoever owns those specs.
- **Environment note:** the container's Playwright wants chromium-1193 and has 1194; I symlinked `/opt/pw-browsers/chromium-1193` and the headless shell to 1194 (outside the repo) to run the suite.
- **Open:** the Grok cards; live Gates for `TEAMS_MEETING`, `MEET_LINK`, `RECURRING_TODO`; the 5 pre-existing e2e failures. Graphify not run.

## 2026-10-21 (Ecosystems builder A, eighth run) — Teams link on an existing Outlook event

- **Capability shipped (logic, switch off):** "Can you add a Teams link to the Thursday sync?" / "תוסיף בבקשה קישור לטימס לישיבת צוות" gets one Do It that turns on the Teams meeting of the one Outlook event the person organizes that fits (by the day named, or its words), is not online yet, not cancelled and not past. Only `isOnlineMeeting` and the provider are patched; guests and text are not touched. Handled only after a read-back by id shows a Teams join link and subject, start and guests unchanged; Undo turns the online meeting off and refuses after the person changed anything else or the link. Microsoft's own join block in the body is not read as an edit (it reuses `core/teams-meeting.js` for the link and the hash). `core/outlook-event-call-link.js`, switch `OUTLOOK_EVENT_CALL_LINK`. No new scope.
- **Not user-visible yet:** not wired into `src/`; card ask M3 is in `card-requests-2026-10-20.md`. Logic only, a partial run against the user-facing bar.
- **Tests:** `test/outlook-event-call-link-corpus.cjs` (5 offers in English and Hebrew, 5 silent with reasons, 5 event-choice cases, patch shape, pending link, no link, foreign host link, event changed, own online meeting, not the person's event, auth, Undo untouched, agenda added, guest added, link swapped, no hash, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wiring behind a card for both M2 and M3; a real Graph check that `isOnlineMeeting: false` removes the meeting on an existing event (documented behaviour, not seen live); live Gate.

## 2026-10-21 (Ecosystems builder B, eighth run) — no new capability; five red e2e specs were date time-bombs

- **Failed run against the user-facing bar, said plainly:** no product capability. The remaining buildable modules still wait on Grok cards or owner scopes (row 79).
- **What I found:** the 5 headless e2e failures from the seventh run are not product bugs. They hard-coded dates that became past on 2026-10-21: `20/10` in a self-sent Hebrew meeting (`engine.spec.js`), `October 20, 2026` for a calendar hold, and a payment on `September 21` for the Sheets append (`google-lane-http.spec.js`). A mail asking for a past date correctly gets no card. A fourth spec (`gate-0956-live.spec.js`, `Friday 23/10`) and the Hebrew `22/10` hold would have failed in the next days.
- **Fixed:** all four now build their dates from the real clock (a week ahead; a payment three days back; the next Thursday or Friday), and the Hebrew hold computes its expected UTC instant for Jerusalem time instead of the fixed `11:00Z`, which would also have broken when Israel's clocks change on 2026-10-25. Result: `engine.spec.js:278`, all of `google-lane-http.spec.js` (19 tests) and `gate-0956-live.spec.js` (8) pass. Whole headless `e2e` suite: 284 of 284 pass; every `test/*corpus.cjs`: green. Specs with fixed page clocks (`lane-chat-draft`, `live-gate-36ae877`, `post-merge-polish`) are deliberate and left alone.
- **Open:** the Grok cards; live Gates for `TEAMS_MEETING`, `MEET_LINK`, `RECURRING_TODO`. Graphify not run.

## 2026-10-21 (Ecosystems builder A, ninth run) — a repeat on the live Gmail Hold It

- **Capability shipped (live path, switch off):** when `glanceSwitches.RECURRING_HOLD` is on and the open mail states one repeat ("Weekly sync every Tuesday at 10:00", "every weekday", "the 15th of each month") and the hold's own date is an occurrence of it, the existing Gmail Hold It creates the repeating series instead of one event. No guest, `sendUpdates=none`. Handled only when the hold's own read-back passes and the master event read by id carries exactly the rule; otherwise the event is deleted and nothing is claimed. It composes with the Meet link (`MEET_LINK`): one create carries both. Undo is the hold's own (deleting the master removes the series) and refuses after an edit. The hold module `core/google-calendar.js` is untouched; the rule is added by wrapping the http function (`seriesFor`, `withRecurrence`, `confirmSeries` in `core/recurring-reminder.js`), wired in `src/google-lane-host.js`. Not turned on by default.
- **User-visible when:** the owner turns the switch on (procedure in the `open-tasks.md` header line). Showing "repeats weekly" on the card is the Grok bot's job (T1 card ask updated). Live Gate: not run.
- **Also fixed:** the third-party check in `core/recurring-reminder.js` now also catches "ask Dana to hold/schedule/book the sync".
- **Tests:** `test/recurring-hold-corpus.cjs` (5 series, 10 stay single with reasons, create shape, master carries the rule, dropped or other rule deleted, delete fails, pass-through, Meet plus repeat in one create, Undo unedited and edited, worker wiring and manifest). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** live Gate with both switches on; "every other week" stays single by design; a real check that Calendar returns `recurrence` on the master for an event created with it (documented behaviour, not seen live).

## 2026-10-21 (Ecosystems builder B, ninth run) — a repeat on the live Outlook meeting Hold It

- **Capability shipped (live path, switch off):** the Outlook twin of builder A's Gmail repeat. On the existing meeting Hold It, when `glanceSwitches.RECURRING_HOLD` is true and the mail states one repeat rule that the hold's own date fits ("hold the weekly sync every Tuesday at 10:00", on a Tuesday; "כל יום שלישי ב-10:00"), the event is created as the series: Graph `recurrence`, no guest, composing with the Teams link. The series master is read back by id for exactly that rule; if it does not carry it the event is deleted and no Handled is returned. The receipt ends `· repeats`. A hold whose date does not fit, or two rules, a hedge, a negation or a third party, stays one event. Default off, no UI turns it on, so a user sees no change today.
- **Undo kept honest:** the event read now includes `recurrence`, and the rule is in `src/native-edit.js`'s snapshot (added for the To Do repeat), so a person moving the series to Wednesday or ending the repeat reads as an edit and Undo leaves it alone. A single event is unchanged.
- **Tests:** `test/recurring-hold-outlook-corpus.cjs` (switch gating, date fits and does not fit, Hebrew, monthly, 6 silences, master read-back ok, no rule, other day, unreadable, snapshot and edit cases, write-path source checks). Whole headless `e2e` suite: 284 of 284 pass; every `test/*corpus.cjs`: green.
- **Open:** one live Graph read of an event `recurrence`; live Gate; the Grok cards for the unwired modules. Graphify not run.

## 2026-10-21 (Ecosystems builder A, tenth run) — Meet link and Gmail repeat proved in a real browser

- **Failed run against the user-facing bar, said plainly:** no new capability. Every buildable module left needs a Grok card or an owner scope (row 79). I did not add another unwired module.
- **What I did instead:** wrote `e2e/meet-and-series.spec.js` (5 specs) and made the local Google lane server behave like Calendar (a conference request is honoured only with `conferenceDataVersion=1`). In a real headless Chromium with the unpacked extension and the real Gmail page flow: switches off, one plain event; `MEET_LINK` on, the create carries the conference request, no guest, the link is read back, Undo deletes; no link, the event is deleted and the card does not say Handled; `RECURRING_HOLD` on, the series master carries the rule; no stated repeat, one plain event. All 5 pass. Every `test/*corpus.cjs` green. The full headless e2e suite: 289 of 289 pass (13.2 minutes), including the 5 new specs.
- **Not claimed:** this is a fake Google server, not Google. Live Gates for `MEET_LINK` and `RECURRING_HOLD` stay not run.
- **Environment note:** Playwright wants chromium-1193 and the container has 1194; I symlinked 1193 to 1194 in `/opt/pw-browsers` (outside the repo).

## 2026-10-21 (Ecosystems builder B, tenth run) — Outlook Teams link, repeat and repeating To Do run in a real browser; one real bug found and fixed

- **Failed run against the user-facing bar, said plainly:** no new capability. What I did is prove the three live Outlook paths from earlier runs in the unpacked extension, which is where the unit corpora could not look. The Graph mock in `e2e/support/launch.js` now serves calendar events (a Teams join link and Microsoft's own join block on read, a dropped link, a dropped rule) and keeps `recurrence` on To Do tasks; `outlookAuth` takes `calendar: true`.
- **Real bug found and fixed:** with `RECURRING_TODO` on, the To Do task stayed a one-off. The repeat recognizer reads its clock with `FlowExtract`, which Node loads by `require` (so the corpora passed) but the service worker never imported, and `core/extract.js` did not set `globalThis` either. `background.js` now imports it before the recognizer, `extract.js` sets `globalThis.FlowExtract` in the worker case, and `test/todo-recurrence-corpus.cjs` pins both. The Gmail twin (builder A) was not affected in its own host, which imports its own copy.
- **Specs (7, all pass):** with every switch off a hold is one plain event; `TEAMS_MEETING` on gives a Teams link, no guest, read back, receipt says Teams, Undo deletes it despite Microsoft's join block; no link returned removes the event and is not Handled; `RECURRING_HOLD` on gives the series, rule read back, receipt says repeats, Undo deletes it; a dropped rule removes the event; `RECURRING_TODO` off is the one-off task; on gives a repeating task read back with its rule and Undo deletes it. A day that does not fit the rule has no e2e: the card stays quiet when the mail's weekday and date disagree; the unit corpus covers the fit rule.
- **Verification:** whole headless `e2e` suite 296 of 296 (284 plus the 7 new and A's 5); every `test/*corpus.cjs` green.
- **Open:** live Gates; one real Graph read of `recurrence` on an event and a To Do task; the Grok cards. Graphify not run.

## 2026-10-21 (Ecosystems builder A, eleventh run) — no new capability; the #128 merge checked

- **Failed run against the user-facing bar, said plainly:** no new capability. Every buildable module left needs a Grok card or an owner scope (row 79), and two builders were already circling the same wired gaps. I did not add another unwired module.
- **What I did instead:** after the large merge of the AI engine (#128, `440861a`) I ran every `test/*corpus.cjs` (all green) and the full headless e2e suite in a real Chromium with the unpacked extension: 289 of 289 pass (12.7 minutes, on the tree before builder B's seven new specs and fix). So the Meet link, the Gmail and Outlook repeat, the Teams link and the repeating To Do still work behind their switches after that merge.
- **Open:** the Grok cards for M2, M3, P1, T1, W1; live Gates for `MEET_LINK`, `TEAMS_MEETING`, `RECURRING_HOLD`, `RECURRING_TODO`; row 79 for the owner. Graphify not run.

## 2026-10-21 (Ecosystems builder A, twelfth run) — Planner wired on the existing Outlook To Do card

- **Capability shipped (live path, switch off):** under the shared rule of 2026-10-21 (wiring into an existing card is the agent's job) the Planner close from the third run is now on the existing Outlook To Do card. With `glanceSwitches.PLANNER_TASK` true, a mail that asks for a task and names exactly one of the person's own Planner plans in words ("track it on the Website relaunch plan", "בתוכנית שיווק") gets its task written to that plan instead of To Do: no assignee (nobody is notified), the date when the card has one, read back by id, reopened by id, Undo deleting with If-Match and refusing after an edit. Any doubt (no plan named, two plans of that name, Jira or Asana named, the plan list not readable, the switch off) leaves the task in To Do exactly as before. No new scope (`Tasks.ReadWrite`), no manifest change. Not turned on by default.
- **Two real bugs found by the real-browser run, fixed:** (1) the module reads `FlowProofOfClose` when it loads, and was imported before it, so the proof was always `proof_pending`; it is now imported after (`src/background.js`, with a comment). (2) the page keeps only `{taskId, externalId}` of a task row, so a Planner flag in the ref was lost and Undo went down the To Do path; the id now says `planner:<id>` and the entity tag Undo needs stays in a worker-side store (`glancePlannerRefs`). The reopen check (`outlookReconcileProof`) reads a `planner:` id from `/planner/tasks/<id>`.
- **Tests:** `test/planner-wiring-corpus.cjs` (6 plan names, 6 stays-in-To-Do cases, regex-safe, the worker wiring); `e2e/outlook-planner.spec.js` (4 specs in a real headless Chromium with the unpacked extension: switch off, plan named with read-back and Undo with If-Match, no plan named, a plan the person does not have); the Graph stand-in in `e2e/support/launch.js` gained Planner endpoints. Every `test/*corpus.cjs` green. Full headless e2e (300 specs: 289 plus builder B's 7 and these 4): 287 passed, 1 failed (`live-gap-165.spec.js:43`), 12 not run after it. I ran `git stash` in the working tree while the suite was booting browsers from copies of the extension, which is the likely cause; the same spec file run alone passes all 13 (the failing one and the 12 not run), so all 300 pass, but not in one clean run. A clean single run was not repeated.
- **Open:** the helper line under a Planner receipt still says `Undo removes the To Do task` (a text slot for the card owner); live Gate; Entra must list `Tasks.ReadWrite` (row 44). Graphify not run.
## 2026-10-21 (Ecosystems builder B, eleventh run) — Word or Excel from a request, wired into the live Outlook card

- **Capability shipped (live path, switch off):** following the shared rule of 2026-10-21 (wiring a new close into an existing card is the agent's job), the empty Word or Excel file from a request now has a Do It on the real Outlook card. One explicit ask with a name ("Can you create a Word document called Supplier onboarding?") shows the canonical card with its step list; Do It puts an empty `.docx` or `.xlsx` in OneDrive > Glance, never replacing a file, read back by id, a receipt that survives a reload, Undo that leaves an edited file. Behind `glanceSwitches.ONEDRIVE_NEW_FILE` (default off) and `Files.ReadWrite`; so a user sees no change today.
- **How it is wired:** the page asks the worker (`flow:new-file-plan`), which owns the switch and `core/onedrive-new-file.js`; the page builds the card (`settleNewFile`, `showNewFileCard`, `onNewFileDoIt`, receipt and Undo in the same style as the calendar hold) and the worker writes and undoes through `WRITERS.onedriveNewFile` and `UNDOERS.onedriveNewFile`. No manifest change, no new scope.
- **Bug found by the browser run:** the module was imported before `onedrive-file.js` that it reads at load, so in the worker it had no file-name builder and answered "no name" to every ask. Import order fixed; Node's `require` had hidden it again.
- **Tests:** 5 new specs in `e2e/outlook-teams-and-series.spec.js` (switch off: no new-file card; on: card shows the step list, Do It makes the file, read back, receipt survives a reload, Undo deletes; Undo leaves an edited file; a taken name is refused and nothing replaced; a mail that asks for content gets no card). The Graph mock now answers `conflictBehavior=fail` with 409 and returns `file`, `size`, `eTag`. Whole headless `e2e` suite: 301 of 301 after one test-isolation fix (the file-put list accumulates across specs; my spec now filters to its own file); every `test/*corpus.cjs`: green.
- **Open:** live Gate; the same wiring for Planner (`PLANNER_TASK`), Google Doc/Sheet/Slides (`WORKSPACE_FILE`, Gmail card), Meet link on an existing event and Teams link on an existing event; one real OneDrive read of `size` right after the upload. Graphify not run.

## 2026-10-21 (Ecosystems builder A, thirteenth run) — empty Doc, Sheet or Slides deck wired on the Gmail card

- **Capability shipped (live path, switch off):** with `glanceSwitches.WORKSPACE_FILE` true, a Gmail mail that explicitly asks for a named new doc, sheet, spreadsheet, tracker or slide deck ("Can you create a shared doc called Q4 launch plan?", "תפתח בבקשה מסמך בשם ...") shows the canonical Do It card with a one-step list. Do It creates the empty native Google file in My Drive, reads it back by id, shows the receipt (it survives a reload), and Undo trashes it only while version and modified time are unchanged (an edited file stays: "You edited this. Undo left it alone."). Nothing is written into the file or shared. No new scope (`drive.file`), no manifest change. Twin of builder B's Outlook Word and Excel card.
- **How it is wired:** the worker answers `flow:google-new-file-plan` only with the switch on (`src/google-lane-host.js`); the page (`src/content-gmail.js`, `showNewFileChip`) asks before its ordinary judgment and, on an offer, injects the existing chip with a `driveNewFile` step; the write and Undo go through the existing `flow:google-write` and `flow:google-undo` as `googleNewFile` (`src/google-lane.js`); the module now has the lane's writer signature (`write(input, http)`, `undo(ref, http)`). The step row says `Drive · <name>` via a new `destinationText` slot in `src/step-list-view.js`, because the default text for a Drive step says the Glance folder, which this file does not use.
- **Two things the real-browser run caught:** a Drive field list the local Google server (and so a strict API) rejects (`owners(...)`), which made the read-back fail and the file be trashed again, and the wrong destination text above.
- **Tests:** `test/gmail-new-file-corpus.cjs` (lane signature, edit refusal, wiring checks); `e2e/gmail-new-file.spec.js` (6 specs in a real headless Chromium: switch off, Doc with read-back and Undo, Sheet and Slides, an ordinary mail, Undo refused after an edit, reload shows a receipt not a second offer). The local Google server now sets a file link. Full headless e2e on the tree with this change: 311 of 311 pass (13.4 minutes), one clean run. Every `test/*corpus.cjs` green; `live-gate-0956-corpus` failed once in 6 repeated runs on "a refused Undo is still shown after reopen" (the To Do receipt in Hebrew, nothing in this change touches it), so it is a flake to watch, not a result of this change.
- **Open:** live Gate; the same wiring for Meet link and Teams link on an existing event (`EVENT_CALL_LINK`, `OUTLOOK_EVENT_CALL_LINK`), which builder B listed. Graphify was used once to find the step-list code.

## 2026-10-21 (Ecosystems builder B, twelfth run) — Teams link on an existing Outlook event, wired into the live card

- **Capability shipped (live path, switch off):** "Can you add a Teams link to the Thursday sync?" now has a Do It on the real Outlook card, the Microsoft twin of the Google event link builder A listed. With `glanceSwitches.OUTLOOK_EVENT_CALL_LINK` true and the Calendar box granted, the worker lists the next fortnight of events (read only) and the module picks the one event the person organizes that fits; the card names it; Do It turns on only that event's Teams meeting, read back by id; Undo turns it off and leaves an event the person edited; the receipt survives a reload. An event that already has a call, a Zoom ask, no match or several matches get no card. Default off, so a user sees no change today.
- **Refactor that made it small:** the new-file code from the last run became `makeCloseChain(cfg)` in `src/content-outlook.js` (plan message, connector, scope check, labels, params); the new-file chain and this one are two configs of it, so the 5 new-file specs re-prove the shared code. Next closes on the Outlook card are a config and a worker handler.
- **Tests:** 5 new specs in `e2e/outlook-teams-and-series.spec.js` (switch off, Do It with read-back and Undo and reload, Undo leaves an edited event, an event that already has a call is never touched, Zoom named gets no card); the Graph mock serves `calendarView` and a PATCH that attaches or removes the Teams link. One test fix: "Thursday" means the nearest coming Thursday.
- **Verification:** whole headless `e2e` suite: 313 passed in the full run plus the 3 `lane-chat-draft` specs my first `calendarView` mock broke (it now answers only when a spec seeded events), all 25 of those and the Outlook spec pass together; every `test/*corpus.cjs` green.
- **Open:** live Gate; Meet link on an existing Google event on the Gmail card (`EVENT_CALL_LINK`, builder A's lane); a real `calendarView` read. Graphify not run.

## 2026-10-21 (Ecosystems builder A, fourteenth run) — Meet link on an existing event, wired on the Gmail card

- **Capability shipped (live path, switch off):** with `glanceSwitches.EVENT_CALL_LINK` true, a Gmail mail that asks to add a call link to an event ("Can you add a Google Meet link to the weekly sync?") shows the canonical Do It card with one step when exactly one event the person organizes fits (by the day or words in the mail body), has no call link, and is not cancelled or past. Do It patches only the conference request (`sendUpdates=none`, guests and text untouched), reads the event back by id for a created `meet.google.com` link, shows the receipt (it survives a reload), and Undo removes only the link, refusing with "You edited this. Undo left it alone." after any other change or a changed link. The calendar is read only with the switch on and only when the mail asks for a link, through the lane's account-checked http. No new scope, no manifest change. Twin of builder B's Teams link card.
- **Wiring:** same pattern as the new-file card: `flow:google-event-link-plan` in `src/google-lane-host.js`, `googleEventCallLink` in `src/google-lane.js`, `showEventLinkChip` and a `calendarCallLink` step in `src/content-gmail.js`; the module has the lane's writer signature (`write(input, http)`, `undo(ref, http)`). The page sends the body only: with the subject included, a subject like "Sync" picked the wrong event in the first browser run.
- **Tests:** `test/gmail-event-link-corpus.cjs` (lane signature, edit refusal, wiring checks); `e2e/gmail-event-link.spec.js` (5 specs in a real headless Chromium: switch off reads nothing, the card then Do It then Undo, no match or already linked shows no card, Undo refused after an edit, reload shows a receipt). The local Google server gained an events list, a PATCH of the conference and a seeding helper; the three other specs that use it (`google-lane-http`, `gmail-new-file`, `meet-and-series`) still pass (30 of 30). Targeted corpora (this change, the lane, docs-consistency, identity-copy) green. Per the run discipline, the whole corpus sweep and the full e2e are left for the last run of the day.
- **Open:** live Gate. My side (Google) has no built-but-unwired module left. Graphify not run (the pattern was already known).

## 2026-10-21 (Ecosystems builder B, thirteenth run) — idle, by the run-discipline rule

- Nothing unblocked and valuable on the Microsoft and Meta side. Microsoft is wired end to end behind switches (Teams link on a hold and on an existing event, repeat on a hold and on To Do, Word or Excel from a request, Planner); what is left is SharePoint (needs the new scope `Sites.ReadWrite.All` or `Sites.Selected`, owner row 79), and OneNote and PowerPoint, where a PowerPoint deck needs a hand-built `.pptx` that I cannot open in Office here to check it is valid, so I did not ship an empty-file builder I cannot verify. Meta needs the owner's Meta setup (Pages, Business API) or is identity work already pinned in row 71. Nothing touched. The live Gates for the switches are the owner's.

## 2026-10-21 (Ecosystems builder A, fifteenth run) — idle by the run-discipline rule

No Google gap is both unblocked and of user value: every built Google module is wired on its card behind its switch; Forms needs the `forms.body` scope and Keep has no public API (open-tasks row 79). Nothing touched.

## 2026-10-21 (Ecosystems builder B, fourteenth run) — idle

- Nothing changed on the Microsoft and Meta side since the last run: SharePoint still waits on the owner's scope (row 79), PowerPoint on a way to verify a hand-built `.pptx`, Meta on the owner's setup. Nothing touched.

## 2026-10-21 (Ecosystems builder A, sixteenth and seventeenth runs, 13:13 and 14:13) — idle by the run-discipline rule

Nothing changed on the Google side since the fifteenth run: no new unwired module, no owner answer on row 79 (Forms scope), Keep has no public API. Nothing touched. The whole corpus sweep and the full e2e are still due once, on the last run of the day.

## 2026-10-21 (Ecosystems builder B, fourteenth run) — chat task card

- **Capability shipped (switch off):** the chat task card, per `docs/glance-ai/chat-task-card-spec.md`. With `glanceSwitches.CHAT_TASK_CARD` true, a task ask in a one-to-one WhatsApp, Messenger or Instagram chat shows the canonical Do It card; Do It writes one Google Task through the Gmail card's lane (or a Microsoft To Do task when only Microsoft is connected), reads it back by id, shows Handled only on `fetchedBack`, and Undo refuses a task the person changed. Nothing is sent, no key is pressed, no composer is written.
- **Spec points:** (1) when: shipped (the judge's `show` with a task step after `draftInto` finds no fact or place answer; groups, the person's own message, a quoted message, and a chat the person already answered stay out); (2) the card: shipped, existing `.flow-chip-host`, `chip.css` and the step css added to every chat registration, no new design, no missing slot found; (3) the write: shipped (Google lane `googleLaneTask`, Outlook `outlookTask`, `threadUrl` is the chat address, the note names the chat); (4) never: shipped, a corpus check fails if the card file touches keys, clicks or the composer; (5) tests: shipped, `test/chat-task-card-corpus.cjs` and `e2e/chat-task-card.spec.js` on the real chat lane registration; (6) reports: this entry.
- **Real findings from the browser run:** production chat lanes did not carry the judge, step kit or storage (now `laneChatScripts` loads the shared base plus the card); the Do It picture is not web-accessible on chat sites (button had zero width), so the worker sends the four pictures as `data:` URLs (`flow:asset-data`, allowlist of four files) without touching the manifest; Google must go through the lane (the older direct writer deletes an edited task on Undo).
- **Open:** live Gate on the three chat sites; owner option to add the chat hosts to `web_accessible_resources` instead of the data-URL path (manifest, needs «מאשר»); builder A extends the card to the Gmail app card.

## 2026-10-21 Ecosystems run A (15th): review only, no user-facing capability (failed run, said plainly)

- Reviewed B's chat task card (`8dd75b6`) against `chat-task-card-spec.md`; the Gmail app card has no inbound-ask Do It of its own, and the add-on's `test/v1.test.cjs` has 5 failures that predate this package (same at `58ac720~1`): the shared judge is now deliberately quiet on a Hebrew meeting with a date but no clock and on a buried "please remember" phrase. Those fixtures are stale against a precision-first judge; loosening the judge to match them would trade precision for recall, so nothing was changed. Needs a decision: update the fixtures to the quiet behaviour, or add a contrast-pair corpus case if the owner wants the Hebrew date-only meeting to speak.
- No code, no switch, no corpus touched.

## 2026-10-21 Ecosystems builder B (fifteenth run): idle by the run-discipline rule

- The chat task card shipped in the previous run; what is left on the Microsoft and Meta side needs the owner (SharePoint scope, Meta business verification, live Gates) or a Grok card. Nothing else touched.

## 2026-10-21 Ecosystems run A (16th): system notices with a deadline (owner priority 3)

- **Capability:** a mail from a known service (Netlify, Vercel, Supabase, GitHub, Google, Microsoft, Namecheap, GoDaddy and others) that says something will be paused, suspended or expire on a date unless you act, now offers one Do It: a task "Update your billing details (Netlify) by Oct 28" with the date (Google Tasks on Gmail, Microsoft To Do on Outlook), English and Hebrew. Unknown or lookalike senders, newsletters, promotions, webinars and notices missing a deadline or an action stay quiet. Behind `glanceSwitches.SYSTEM_NOTICE` (off). Nothing is paid, renewed or signed in by Glance.
- **Code:** `core/system-notice.js`, `core/incoming-judge.js`, `src/content-gmail.js` (`classifyForChip`, `planOpenMail`), `src/content-outlook.js`, `manifest.json` (one core file added to the content-script list, no permission change), add-on bundle rebuilt.
- **Tests:** `test/system-notice-corpus.cjs` (all pass); surface-parity, gmail-outlook-parity, identity-copy, chat-task-card, cc-only, deadline-meeting, intent-model green. Not mine and already red before: `gate-0950-proof` (1) and the add-on `v1.test.cjs` (5). docs-consistency red only until this commit's README row. No e2e in a real browser for this card yet.
- **Open:** live Gate (owner); the phone card and chat do not pass the switch; a sender list from the person's own correspondents; Gmail page path covered by wiring checks only.

## 2026-10-21 Ecosystems builder B (sixteenth run): idle by the run-discipline rule

- No Microsoft or Meta gap is unblocked (SharePoint scope, Meta verification, live Gates and Grok cards are the owner's). Builder A shipped system notices; chat does not carry that switch and a service notice in a chat is not a real situation. Nothing touched.

## 2026-10-21 Ecosystems run A (17th): idle. Every owner priority is built; the Google rows left are Forms (owner scope) and Keep (no API); nothing unblocked. No code touched.

## 2026-10-21 Ecosystems builder B (seventeenth run): idle by the run-discipline rule (nothing unblocked, nothing touched)

## 2026-10-21 Ecosystems builder B (eighteenth run): idle, nothing changed since the last run

## 2026-10-21 Ecosystems run A (18th): idle. Nothing unblocked on the Google side (Forms needs the owner, Keep has no API); no code touched.

## 2026-10-21 Ecosystems builder B (nineteenth run): idle, nothing changed since the last run

## 2026-10-21 Ecosystems run A (19th): idle. Same state as the 18th; no code touched.

## 2026-10-21 Ecosystems builder B (twentieth run): idle, nothing changed since the last run

## 2026-10-21 Ecosystems run A (20th): idle. Same state as the 18th; no code touched.

## 2026-10-21 Ecosystems builder B (twenty-first run): idle, nothing changed since the last run

## 2026-10-21 Ecosystems run A (21st): idle. Same state as the 18th; no code touched.

## 2026-10-21 Ecosystems builder B (twenty-second run): idle, nothing changed since the last run

## 2026-10-21 Ecosystems run A (22nd): idle. Same state as the 18th; no code touched.

## 2026-10-21 Ecosystems builder B (twenty-third run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (23rd): idle. Same state as the 18th; no code touched.

## 2026-10-22 Ecosystems builder B (twenty-fourth run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (24th): idle. Same state as the 18th; no code touched.

## 2026-10-22 Ecosystems builder B (twenty-fifth run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (25th): idle. Same state as the 18th; no code touched.

## 2026-10-22 Ecosystems builder B (twenty-sixth run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (26th): idle. Same state as the 18th; no code touched.
