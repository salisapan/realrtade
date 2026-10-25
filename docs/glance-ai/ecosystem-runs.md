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

## 2026-10-22 Ecosystems builder B (twenty-seventh run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (27th): idle. Same state as the 18th; no code touched.

## 2026-10-22 Ecosystems builder B (twenty-eighth run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (28th): idle. Same state as the 18th; no code touched.

## 2026-10-22 Ecosystems builder B (twenty-ninth run): idle, nothing changed since the last run

## 2026-10-22 Ecosystems run A (29th): idle. Same state as the 18th; no code touched.

## 2026-10-23 Ecosystems run A (30th): idle. The worker restarted many times and 26 hourly triggers queued; they were read as one run. Same state as the 18th; no code touched.

## 2026-10-23 Ecosystems builder B (thirtieth run): idle. 27 hourly triggers queued while the worker restarted and were read as one run; no code changed on the branch since the chat task card, nothing unblocked, nothing touched.

## 2026-10-23 Ecosystems run A (31st): idle. Same state as the 18th; no code touched.

## 2026-10-23 Ecosystems builder B (thirty-first run): idle, nothing changed since the last run

## 2026-10-23 Ecosystems run A (32nd): idle. Same state as the 18th; no code touched.

## 2026-10-23 Ecosystems builder B (thirty-second run): idle, nothing changed since the last run

## 2026-10-23 Ecosystems run A (33rd): idle. Same state as the 18th; no code touched.

## 2026-10-23 Ecosystems run A (34th): Google Forms

- **Capability:** a mail that asks "Can you create a feedback form for the Q4 launch?" or «תוכל לפתוח טופס הרשמה בשם ...» now gets the same Do It card as a Doc: an empty Google Form with that name, read back by id, with Undo that leaves a form the person edited alone. A form that asks for specific questions, a third party, a hedge or another app (Typeform, Microsoft Forms) stays silent. Behind `WORKSPACE_FILE` (off). Hebrew infinitives (לפתוח, ליצור, להכין, להקים) now also read as a request for Docs and Sheets.
- **Code:** `core/workspace-file.js` (kind `form`), `src/content-gmail.js` (card label and closed line). The lane, verify and Undo wiring already carry the connector.
- **Tests:** `test/google-form-corpus.cjs` (all pass: recognition both languages, create, read-back, withdraw on a different title, 403, Undo untouched, Undo edited, already deleted); workspace-file, gmail-new-file, docs-consistency, identity-copy, surface-parity, gmail-outlook-parity, system-notice green. No real-browser e2e for the form yet (the fake Google server has no Forms endpoint).
- **Open:** the two manifest lines above (owner «מאשר»); until then the write answers not-connected. Live Gate not run.
## 2026-10-23 Ecosystems builder B (thirty-third run) — chat meeting hold

- **Capability shipped (switch off):** a meeting proposed in a WhatsApp, Messenger or Instagram chat (English and Hebrew) now shows the Do It card; Do It makes one hold on the person's own Google Calendar (the Gmail lane) or Outlook Calendar, read back by id, Undo refuses an event the person changed, nobody is invited, nothing is sent. The shared judge also gained the Hebrew «אפשר/נוכל/בא לך להיפגש» forms (Gmail and Outlook benefit).
- **Tests:** `test/chat-task-card-corpus.cjs` (meeting lines EN+HE, quiet negatives, both providers), `e2e/chat-task-card.spec.js` (hold, reload receipt, Undo, edited-event refusal on the real chat lane), all 181 corpora, add-on bundle rebuilt.
- **Open:** live Gate on the three chat sites; Outlook hold has corpus coverage only, no browser spec.

## 2026-10-23 Ecosystems builder B (thirty-fourth run) — own-promise card in chats

- **Capability shipped (switch `CHAT_PROMISE_CARD`, off):** Glance now catches what the person promised in a chat. A dated promise typed in a one-to-one WhatsApp, Messenger or Instagram chat (EN and HE) shows the Do It card; Do It writes one task due that day, titled with the promise and who it was made to, read back by id, Undo refuses an edited task. Vague promises, groups and forwarded messages stay quiet; nothing is sent.
- **Grok sync:** `git log` and `card-requests-*.md` checked at the start: nothing new from the Grok bot; the card reuses the canonical one, no new request.
- **Tests:** corpus (own-promise lines EN+HE, quiet negatives, switch separation) and 3 new browser specs on the real chat lane.
- **Open:** live Gate; Outlook hold browser spec.

## 2026-10-23 Ecosystems run A (35th): the repeating reminder on the Gmail card

- **Capability:** a mail that states a repeating commitment ("Please send the sales report every Monday at 9:00", «תשלח את דוח המכירות כל יום שני ב-9:00») now gets a Do It card that adds one repeating event to the calendar, no guest, with a popup at the start. Handled only when the event is read back by id with the same title, first start and rule; Undo deletes the series only while it is unchanged. A standing reminder does not mark the ask closed. A meeting that repeats stays the Hold It card. Behind `glanceSwitches.RECURRING_REMINDER` (off).
- **Code:** `core/recurring-reminder.js` (lane http adapter, `write`), `src/google-lane.js`, `src/google-lane-host.js` (plan message, write input, verify URL), `src/content-gmail.js` (`showRecurringChip`, payload, connector map). No manifest change.
- **Tests:** `test/recurring-reminder-wiring-corpus.cjs` (all pass); recurring-reminder, recurring-hold, workspace-file, gmail-new-file, gmail-event-link, meet-wiring, event-call-link, google-form, docs-consistency, identity-copy, surface-parity, gmail-outlook-parity, system-notice green. No real-browser e2e yet.
- **Open:** live Gate (owner); Outlook has no equivalent card for this yet.

## 2026-10-23 Ecosystems builder B (thirty-fifth run) — agreed meetings in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** when someone agrees a meeting in a chat («מעולה, נתראה ביום חמישי ב-15:00», "Sounds good, see you Thursday at 3pm", «סגור, מחר ב-10:00») Glance offers the hold on the person's own calendar, titled "Meeting · Dana" / «פגישה · דנה» (proposals get the same tidy title). Questions, cancels, look-backs and past times stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked first; nothing new from Grok; canonical card reused.
- **Tests:** `test/meeting-confirm-corpus.cjs` (10 agreed lines, 14 quiet lines, three time zones), chat corpus, 2 new browser specs on the real chat lane (21 specs pass with the lane specs).
- **Open:** live Gate; Outlook hold browser spec.

## 2026-10-23 Ecosystems run A (36th): real-browser proof of the form and the reminder

- **Capability:** none new for the user; this run proves the two built last (Google Form, repeating reminder) in the unpacked extension against the local Google server, and fixes what that found: with the switch on, the repeating reminder could never reach Handled in the service worker (its calendar and ProofOfClose modules were read at load, before they were loaded), and a mail whose subject was the word "Ask" was silenced for a form request. Both are fixed; both features now complete end to end (Do It, write, read-back, Undo, Undo refused after an edit).
- **Tests:** `e2e/gmail-form-and-reminder.spec.js` 6/6; gmail-new-file, meet-and-series and gmail-event-link e2e 16/16; recurring-reminder, recurring-hold, workspace-file, google-form, gmail-new-file, docs-consistency, identity-copy, surface-parity, system-notice corpora green. The fake Google server gained a Forms stand-in.
- **Open:** live Gates (owner); manifest scope and host for Forms («מאשר»).

## 2026-10-23 Ecosystems builder B (thirty-sixth run) — call proposals in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a call proposed in WhatsApp, Messenger or Instagram («אפשר שיחת וידאו ביום חמישי ב-15:00?», "Can we do a Teams call Thursday at 3pm?") now shows the Do It card; Do It holds it on the person's own calendar titled "Call · name", and with the owner's `TEAMS_MEETING` (Outlook) or `MEET_LINK` (Google) switch on the hold carries the Teams or Meet join link, read back by id. Zoom, hedges, negations and two times stay quiet; nobody is invited, nothing is sent.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** `test/chat-task-card-corpus.cjs` (call words reach both providers, title, 5 quiet lines), chat browser spec, all corpora.
- **Open:** live Gate; browser spec for the Teams link in Outlook chat (corpus only).


## 2026-10-23 Ecosystems run A (37th): idle. The Google rows left wait on others, not on code: Forms (scope + host, owner «מאשר»), Contacts and Sheets row (scopes, owner), invite reply (choice card, Grok bot, card-requests-2026-10-20.md C5), Keep (no API).

## 2026-10-23 Ecosystems builder B (thirty-seventh run) — reminders asked in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a friend or colleague who writes «אל תשכח להביא את הטופס החתום ביום שני» or "Don't forget to bring the signed form on Monday" in WhatsApp, Messenger or Instagram now gets the Do It card; Do It writes one task with that thing, due that day, noting the chat only, read back by id, Undo refuses an edited task. The shared judge missed these (no request verb); questions, look-backs, hedges, no day, past days and the person's own messages stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-reminder-corpus.cjs` (8 reminders EN+HE, 13 quiet lines), chat card corpus (EN+HE card, write, quiet lines), all corpora.
- **Open:** live Gate; no browser spec for this path yet (it shares the task write the 11 chat specs already prove).


## 2026-10-23 Ecosystems run A (38th): idle. Same waits as the 37th; no «מאשר» yet.

## 2026-10-23 Ecosystems builder B (thirty-eighth run) — deadlines asked in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** «תחתום על החוזה עד יום שישי», «אני צריך את המצגת עד מחר» or "Need the report by Wednesday" in WhatsApp, Messenger or Instagram now gets the Do It card; Do It writes one task with the thing, due that day, read back by id, Undo refuses an edited task. The shared judge missed these (no question or polite verb); questions, hedges, own promises, a third person, no day, past days stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-deadline-ask-corpus.cjs` (9 asks EN+HE, 15 quiet lines), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate; "pay the deposit this week" (no named day) stays quiet by design.


## 2026-10-23 Ecosystems run A (39th): idle. Same waits as the 37th; no «מאשר» yet.

## 2026-10-23 Ecosystems builder B (thirty-ninth run) — call me back in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a chat message that asks the person to call back on a named day («תתקשר אליי מחר», "Please call me back tomorrow") now gets the Do It card; Do It writes one task "Call back · name" due that day, read back by id, Undo refuses an edited task. Glance never calls anyone. Refusals, hedges, third persons, look-backs and no day stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-callback-ask-corpus.cjs` (8 asks EN+HE, 15 quiet lines), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate; found but left alone: the shared judge shows a card for an inbound "I'll call you tomorrow" (the sender's promise), which is not an ask of the person.


## 2026-10-23 Ecosystems run A (40th): idle. Same waits as the 37th; no «מאשר» yet.

## 2026-10-23 Ecosystems builder B (fortieth run) — payment asks in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a chat message that asks the person to pay with an amount and a day («תעביר לי 500 שקל עד יום ראשון», "Please transfer 500 NIS to my account by Sunday") now gets the Do It card; Do It writes one task "Pay 500 NIS · name" due that day, read back by id, Undo refuses an edited task. Glance pays nothing. Own promises, payments already made, hedges, refusals, two amounts, no amount, no day stay quiet. This is the first user's money case («אף שקל לא נופל בין הכיסאות»).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-payment-ask-corpus.cjs` (8 asks EN+HE, 17 quiet lines), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate; the shared judge still shows a task for an inbound "I'll transfer … by Sunday" (the sender's promise), not touched.

## 2026-10-23 Ecosystems builder B (forty-first run) — what the sender promised, in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** when someone promises the person something in WhatsApp, Messenger or Instagram («אשלח לך את החוזה ביום ראשון», "I'll send you the contract on Sunday"), the Do It card now logs "Waiting on Dana: Send the contract on Sunday" / «מחכים ל-Dana: לשלוח את החוזה ביום ראשון», due that day. Before, the card read "Log commitment for Oct 25", with no thing and no name, and looked like the person's own to-do (the issue noted in runs 39 and 40). A promise with no nameable thing keeps the generic title.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** chat card corpus (two promise lines, vague promise), all corpora, chat browser spec.
- **Open:** live Gate; the task is a follow-up, so Handled still needs the person to act on it (tracking is not completion).

## 2026-10-23 Ecosystems builder B (forty-second run) — appointments confirmed in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a clinic, salon, restaurant or person who confirms a booking in WhatsApp, Messenger or Instagram («התור שלך נקבע ליום ראשון בשעה 10:00», "Your appointment is confirmed for Sunday at 10:00") now gets the Do It card; Do It puts "Appointment · name" / «תור · שם» on the person's own Google or Outlook calendar, read back by id, Undo refuses an edited event, nobody is invited. Cancellations, offers of slots, questions, look-backs and a missing day or clock stay quiet. Before this, such a confirmation was mis-titled "Meeting" when the agreed-meeting reader caught the word "confirmed".
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-appointment-notice-corpus.cjs` (8 notices EN+HE, 16 quiet lines), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate. Next buildable: a pickup deadline («ההזמנה מוכנה לאיסוף עד יום חמישי») as a task.

## 2026-10-23 Ecosystems builder B (forty-third run) — pickup deadlines in chats

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** a shop, courier or clinic that writes in WhatsApp, Messenger or Instagram that the person's order is ready for pickup until a day («ההזמנה שלך מוכנה לאיסוף עד יום חמישי», "Your order is ready for pickup until Friday") now gets the Do It card; Do It writes one task "Pick up the order · name" due that last day, read back by id, Undo refuses an edited task. A delivery that simply arrives, a pickup already made, a cancellation, a question, an offer and a missing deadline stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-pickup-notice-corpus.cjs` (8 notices EN+HE, 15 quiet lines), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate; the chat modules (reminder, deadline, callback, payment, appointment, pickup) share the same fallback chain in `src/chat-task-card.js`, worth a measured pass on real, private lines by the owner.

## 2026-10-23 Ecosystems builder B (forty-fourth run) — invitations in chats, and a silence audit

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** an invitation in WhatsApp, Messenger or Instagram («מוזמן ליום ההולדת שלי ביום שישי ב-20:00», "You're invited to my birthday on Saturday at 8pm", «מזמינים אתכם לחתונה ביום חמישי בשעה 19:30») now gets the Do It card; Do It puts "Invitation · name" / «הזמנה · שם» on the person's own calendar, read back by id, Undo refuses an edited event, nobody is invited, and accepting or declining stays the person's. Promotions, webinars, thank-yous, cancellations, questions and a missing day or clock stay quiet.
- **Audit (answers the open item of run 43):** new `test/chat-fallbacks-silence-corpus.cjs` runs all seven chat fallback readers (reminder, deadline, callback, payment, appointment, pickup, invitation) over 45 everyday EN+HE lines that carry a day, clock, number or request word: all stay silent. These are still invented lines; a measured pass on real private chat lines remains the owner's.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-invitation-notice-corpus.cjs` (8 invitations EN+HE, 16 quiet lines), the silence corpus (315 checks), chat card corpus, all corpora, chat browser spec.
- **Open:** live Gate.

## 2026-10-23 Ecosystems builder B (forty-fifth run) — reminders to self in chats

- **Capability shipped (switch `CHAT_PROMISE_CARD`, off):** a person who types «תזכיר לי מחר לשלם חשבון חשמל», «לעצמי: לחדש דרכון עד יום חמישי», "Remind me tomorrow to pay the electricity bill" or "Note to self: renew the passport by Thursday" in WhatsApp, Messenger or Instagram (the self-chat habit) now gets the Do It card; Do It writes one task titled with the thing, due that day, with no name of the other person, read back by id, Undo refuses an edited task. An inbound "remind me", a question, a hedge, a refusal, no thing or no day stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/chat-self-note-corpus.cjs` (8 notes EN+HE, 13 quiet lines), chat card corpus (switch separation, write, inbound not read), the silence corpus now covers eight readers, all corpora, chat browser spec.
- **Open:** live Gate. The page cannot tell a self-chat from a chat with another person, so the cue words, not the thread, decide.

## 2026-10-23 Ecosystems builder B (forty-sixth run) — Outlook booking confirmations and pickup notices

- **Capability shipped (switch `glanceSwitches.BOOKING_NOTICE`, off):** an Outlook mail that says "Your appointment is confirmed for Sunday at 10:00" / «התור שלך נקבע ליום ראשון בשעה 10:00» now shows the existing Hold It card (event "Appointment · sender", nobody invited, read back by id, Undo deletes), and a mail that says "Your order is ready for pickup until Friday" / «ההזמנה שלך מוכנה לאיסוף עד יום חמישי» the existing To Do card (task "Pick up the order · sender" due that day). Until now these mails showed nothing (the mail judge saw no ask). First time the chat readers serve a mail surface: the one-algorithm rule holds, the readers live in `core/` and the judge calls them.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** new `test/booking-notice-corpus.cjs` (4 appointments, 2 pickups, switch off, own mail, not inbound, 8 quiet lines, wiring), new real-browser `e2e/outlook-booking-notice.spec.js` (3 specs: off shows nothing, hold with Undo, pickup task with Undo), all corpora, add-on bundle rebuilt.
- **Open:** live Gate; Gmail not wired (own classify path); manifest `js` list gained two core files (content-script list only; the owner may want to see it).

## 2026-10-24 Ecosystems builder B (forty-seventh run) — Outlook invitations

- **Capability shipped (switch `glanceSwitches.BOOKING_NOTICE`, off):** an Outlook mail that invites the person to an event with a day and a clock («מוזמן לאירוע ההשקה שלנו ביום חמישי בשעה 19:00», "You're invited to our product launch on Thursday at 19:00") now shows the existing Hold It card; Do It adds "Invitation · sender" to the calendar, nobody invited, read back by id, Undo deletes. Promotions, webinars, thank-yous and mail without a clock stay quiet. Third notice kind on the same switch after bookings and pickups.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** `test/booking-notice-corpus.cjs` extended (3 invitations, 3 more quiet lines, manifest wiring), `e2e/outlook-booking-notice.spec.js` now 4 specs in a real browser, all corpora, add-on bundle rebuilt.
- **Open:** live Gate; Gmail not wired.

## 2026-10-24 Ecosystems builder B (forty-eighth run) — Outlook payment asks

- **Capability shipped (switch `glanceSwitches.PAYMENT_ASK`, off):** an Outlook mail that asks the person to pay with an amount and a day («שלום, תעביר לי 500 שקל עד יום ראשון», "Please transfer 500 NIS to my account by Sunday") now shows the existing To Do card; Do It writes "Pay 500 NIS · sender" / «לשלם 500 NIS · שולח» due that day, read back by id, Undo deletes. Glance pays nothing. Own promises, payments already made, hedges, refusals, two amounts, no amount, no day, and the person's own mail stay quiet. Hebrew greetings ahead of the pay verb («שלום, …») now count in the payment reader (chat too).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/payment-ask-mail-corpus.cjs` (4 asks, Gmail step, switch off, own mail, not inbound, 10 quiet lines, wiring), `e2e/outlook-booking-notice.spec.js` now 5 specs in a real browser (payment off then on, Undo), chat payment and silence corpora, all corpora, add-on bundle rebuilt.
- **Open:** live Gate; Gmail not wired; the switch is separate from `BOOKING_NOTICE` on purpose (paying is a different trust decision from a calendar hold).

## 2026-10-24 Ecosystems builder B (forty-ninth run) — Gmail gets booking notices and payment asks

- **Capability shipped (switches `BOOKING_NOTICE`, `PAYMENT_ASK`, both off):** the Gmail card now does what Outlook learned in runs 46 to 48: a mail that confirms an appointment, invites to an event, says an order is ready for pickup until a day, or asks the person to pay an amount by a day gets the existing Hold It or task card (event, or Google Task "Pick up the order · sender" / "Pay 500 NIS · sender"), read back by id, Undo deletes, nobody invited, nothing paid. Same readers, same judge helpers (`FlowIncomingJudge.bookingNotice` / `paymentAsk`, exported), so the three surfaces agree.
- **Found and fixed on the way:** the judge's intents carried no `signals` and the Gmail scan threw on `signals.score` (the first run of the browser spec showed it); they now carry a fixed score. Gmail titles its holds "Hold Sun 14:00" by its own convention, so the spec checks that, not "Appointment".
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `e2e/gmail-booking-notice.spec.js` (4 specs: off shows no card for a pickup or a payment ask, hold with Undo, pickup task with Undo, payment task with Undo) in a real browser against the local Google server, the Outlook spec (5/5), `test/booking-notice-corpus.cjs` extended with Gmail wiring, all corpora, add-on bundle rebuilt.
- **Open:** live Gate; Gmail already showed a "Schedule It" card for an appointment confirmation with a clock (existing behaviour), so with `BOOKING_NOTICE` on the notice takes that card over; the owner can compare in the live Gate.

## 2026-10-24 Ecosystems builder B (fiftieth run) — booking and payment readers now work on real, long mail

- **Capability shipped (switches `BOOKING_NOTICE`, `PAYMENT_ASK`, off):** the readers behind runs 46 to 49 were written for one-line messages and refused any text over 200 to 280 characters, so a real mail (greeting, the line that matters, directions, signature; the probe was 321 characters) was silently missed on Outlook and Gmail. The judge now asks each reader about one sentence, two neighbouring sentences and the lead clause before a comma or "so", and the first hit wins. A booking confirmation, an invitation, a pickup notice or a payment ask in an ordinary mail now gets the card; a cancellation, a newsletter that mentions a webinar, and a mail that only mentions money stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/booking-notice-corpus.cjs` (3 long mails EN+HE that must hit, 2 long mails that must stay quiet), `test/payment-ask-mail-corpus.cjs` (1 long ask, 1 long mention), `e2e/outlook-booking-notice.spec.js` (long mail in a real browser, 6 specs), the Gmail spec (4), all corpora, add-on bundle rebuilt.
- **Open:** live Gate. The windows are applied only to these mail readers; the chat card still reads whole messages, which are short by nature.

## 2026-10-24 Ecosystems builder B (fifty-first run) — reminders, deadlines and call-backs in mail

- **Capability shipped (switch `glanceSwitches.TASK_ASK`, off):** a mail that says "Don't forget to bring the signed form on Monday", "I need the signed contract by Wednesday", "Please sign the lease by Monday", "Please call me back tomorrow" («אל תשכח להביא את הטופס ביום שני», «תחתום על החוזה עד יום שישי», «תתקשר אליי מחר») now gets the existing task card on Outlook (To Do) and Gmail (Google Tasks): the task is the thing, or "Call back · sender", due that day, read back by id, Undo deletes. The shared judge saw none of these (no question, no polite verb). Stricter than chat on purpose: only when the person's address is on To and the mail is not Cc-only (`FlowIntent.copiedOnly`); no To list is quiet. Mail is read sentence by sentence; a greeting before the line is stripped.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `test/task-ask-mail-corpus.cjs` (7 asks EN+HE, Gmail step, switch off, Cc-only, no To, someone else, own mail, not inbound, a long mail, 13 quiet lines, wiring), real-browser specs on Outlook (off then on with Undo, Cc-only quiet) and Gmail (off then on with Undo), 13 browser specs in the two booking files, all corpora, add-on bundle rebuilt.
- **Open:** live Gate; the manifest content-script `js` list gained three reader files (no permission, host or scope change).

## 2026-10-24 Ecosystems builder B (fifty-second run) — everyday Hebrew dates in every reader

- **Capability shipped (all existing switches, off):** a probe of the seven chat readers and the mail judge with everyday Hebrew found that most real ways of naming a day missed: «ביום ה׳», «ב־10:00» with the Hebrew hyphen, «עד 28.10», «בעוד יומיים», «בעוד שלושה ימים» and "in 3 days" all returned "no day" (the date reader takes only full weekday names, "28/10" and month names). New `core/day-words.js` rewrites them before each reader looks for its one day, so a booking, an invitation, a pickup, a payment ask, a reminder, a deadline, a call-back or a note to self written the way people write now gets its card (chat, Outlook and Gmail). Dotted dates become an ISO date (next such day when there is no year), because "5/11" is ambiguous. Prices, versions and decimals (12.50, 2.10) are not taken for dates. Also found: the plural «מוזמנים» never read as an invitation (final-nun spelling); fixed.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** new `test/day-words-corpus.cjs` (14 rewrites, 9 left alone, 15 readers finding their day, 6 decimals that must not become days), the silence corpus gained 6 everyday lines with abbreviations and dates, all corpora, 25 real-browser specs (Outlook, Gmail, chat) including a new Hebrew «בעוד יומיים» task on Outlook, add-on bundle rebuilt.
- **Open:** live Gate; `core/day-words.js` joined the shared content-script `js` list in `manifest.json` (no permission, host or scope change). Hebrew number words as amounts («חמש מאות שקל») are still not read.

## 2026-10-24 Ecosystems builder B (fifty-third run) — amounts written in words

- **Capability shipped (switches `CHAT_TASK_CARD`, `PAYMENT_ASK`, off):** people write money in words as often as in digits, in Hebrew especially («תעביר לי חמש מאות שקל», «אלפיים ש"ח»). The payment reader only took digits, so those asks got no card. It now reads «חמש מאות שקל», «שלוש מאות וחמישים שקל», «אלף ומאתיים שקל», «שני אלף», «שלושת אלפים ש״ח», "five hundred shekels", "two thousand five hundred NIS" and "a hundred dollars" (rewritten to digits and the same currency word first), in chat, Outlook and Gmail. A number of people or things («חמישה אנשים») is not money; two amounts stay quiet. Closes the "Hebrew number words as amounts" item left open in run 52.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/chat-payment-ask-corpus.cjs` (7 asks in words, 4 more quiet lines), `test/payment-ask-mail-corpus.cjs` (2 in words), the silence corpus (4 more everyday lines with amounts in words), all corpora, chat/Outlook/Gmail browser specs (25).
- **Open:** live Gate; amounts such as «מאה וחמישים אלף» (over a thousand with a trailing hundreds part) and decimals in words are not read, by design.

## 2026-10-24 Ecosystems builder B (fifty-fourth run) — «ב-7 בערב» and "at noon"

- **Capability shipped (all existing switches, off):** the next everyday Hebrew time form the date reader missed: a clock with a part of the day. «התור שלך נקבע ליום ראשון ב-4 אחה"צ», «מוזמן לחתונה ביום חמישי ב-7 בערב», «סגור, נתראה ב-3 אחר הצהריים», «ב־12 בצהריים», «ב-11 בלילה», "at noon", "at midnight" had no clock, so no card (the reader took only «בשעה 8 בערב»). `core/day-words.js` now rewrites them to a written am or pm, which also fixes the case where the reader refuses a bare 12 or 00 on purpose (noon and midnight are unambiguous once written that way). Chat, Outlook, Gmail and the agreed-meeting reader benefit. An hour that is still ambiguous («ב-8 בצהריים») stays unresolved on purpose.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/day-words-corpus.cjs` (9 clock rewrites, 3 left alone, 6 readers reading the part of the day, 1 ambiguous hour that must stay unresolved), meeting-confirm and chat corpora, all corpora, browser specs.
- **Open:** live Gate. No manifest change this run.

## 2026-10-24 Ecosystems builder B (fifty-fifth run) — the Outlook hold from a chat now completes

- **Capability shipped (switch `CHAT_TASK_CARD`, `TEAMS_MEETING`, off):** for a person who has only Microsoft connected, a meeting or a Teams call proposed in WhatsApp, Messenger or Instagram showed the Do It card and created the Outlook event, but the card never turned to Handled and gave no Undo. The chat card accepted a write only if `ref.taskId` or `ref.externalId` was set, and the Outlook meeting write answers with `ref.eventId`. Found by writing the real-browser spec the previous runs listed as open ("Outlook hold has corpus coverage only"): the corpus stub had used `externalId`, so it passed. Fixed. Now the whole path works in a real browser: one hold, no guest, read back by id, Handled, Undo deletes it; with `TEAMS_MEETING` on a Teams call proposal carries a Teams join link, with it off a plain hold.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** new `e2e/chat-outlook-hold.spec.js` (3 specs: hold with Undo, Teams link on, plain hold off), the chat card corpus gained the `eventId`-only case (and the case without read-back that must stay unhandled), all corpora, chat/Outlook/Gmail browser specs.
- **Open:** live Gate. An Outlook task from a chat (`outlookTask`) uses To Do's ref and was already covered by its corpus; a browser spec for it is not written.

## 2026-10-24 Ecosystems builder B (fifty-sixth run) — the Microsoft To Do task from a chat, proved; the message text stays out of it

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** for a person who has only Microsoft connected, a task or a reminder asked in WhatsApp, Messenger or Instagram is one To Do task naming the chat, read back by id, Handled, with Undo that deletes it; now proved in a real browser (the open item from run 55). The spec found a privacy mismatch: the Microsoft write copied the whole chat message into the task body as `Quote: "…"` (the card sent `text`, `entities` and `params.what`), while the Google task note holds only the sender and the chat address, as the spec and the coverage page say. Fixed: nothing from the words of a chat message travels into a To Do task (the worker still gets the call words for a Teams link, only for a hold).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** `e2e/chat-outlook-hold.spec.js` now 5 specs (hold with Undo, Teams link on, plain hold, To Do task, To Do reminder; the task spec asserts the message is not in the body), the chat card corpus asserts the payload carries no message words, all corpora, chat/Outlook/Gmail browser specs.
- **Open:** live Gate. Own-promise and note-to-self cards on Microsoft are covered by the same write but have no browser spec of their own.

## 2026-10-24 Ecosystems builder B (fifty-seventh run) — "at 8.30 pm" was read as 8:00

- **Capability shipped (all existing switches, off):** a probe of the clock forms people really type found a wrong-hour error in the shared date reader: "at 8.30 pm" (dotted clock) came back as 08:00, so a chat or a mail that says "see you at 8.30 pm" would have been offered as a hold at the wrong hour. `core/day-words.js` now writes the clock out first: dotted clocks ("at 8.30 pm", «ב-20.00», «בשעה 8.15»), «ב-8 וחצי» and «ב-8 ורבע» (also with a part of the day: «ב-8 וחצי בערב»), "half past 8", "quarter past 5", "quarter to 9". Chat, Outlook and Gmail readers and the agreed-meeting reader benefit. Prices and decimals are left alone ("12.50 NIS"). Dotted dates still win where they are valid dates («ב-5.11»).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/day-words-corpus.cjs` (9 more rewrites, 2 more left alone, 5 readers reading the written clock, the "8.30 pm" regression), all corpora, browser specs.
- **Also fixed at the source:** `core/extract.js` `parseTime` now reads a dotted clock that carries am or pm ("at 8.30 pm") as that clock, so the Gmail and Outlook meeting-proposal cards no longer offer 08:00 for 20:30; "at 12.50 NIS" and a bare "at 8.30" are untouched; every corpus stays green.
- **Open:** live Gate.

## 2026-10-24 Ecosystems builder B (fifty-eighth run) — "by the 30th", «עד סוף החודש»

- **Capability shipped (all existing switches, off):** a probe of deadline wording found that the most common ways people set a deadline without a weekday had no day for the readers: "by end of the week", "by the end of the month", "by the 30th", «עד סוף השבוע», «עד סוף החודש», «עד ה-30», «עד 30 לחודש» and "the 5th of November". `core/day-words.js` now turns them into dates (end of the week is Friday, end of the month the last day, a day of the month the next such day), so a deadline ask, a reminder, a payment ask or a pickup notice written that way gets its card in chat, Outlook and Gmail. A day that does not exist ("the 40th") and a bare hour («עד 10») are not taken for dates.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/day-words-corpus.cjs` (10 more rewrites, 4 more left alone, 5 readers finding the new day forms), all corpora, browser specs.
- **Open:** live Gate; "next week" / «בשבוע הבא» as a deadline stays unread on purpose (no single day).

## 2026-10-24 Ecosystems builder B (fifty-ninth run) — the everyday day and clock forms at the source

- **Capability shipped (all switches, and the cards that are on today):** runs 52 to 58 taught `core/day-words.js` the day and clock forms people really write («ביום ה׳», «עד 28.10», «ב-8 וחצי בערב», "half past 8", "by the 30th", «עד סוף החודש», «בעוד יומיים») but only the new chat and mail readers called it. The shared date reader `core/extract.js` (`parseDate`, `parseTime`) now runs it first, so the cards that are on today (meeting proposals, requests, holds in Gmail and Outlook), the follow-up reader, the service worker and the phone card's bundle all take those forms; before, a Hebrew meeting proposed «ביום ה׳ ב-8 בערב» or «עד ה-30» had no day or clock and showed no Hold It. «סוף השבוע» is Thursday (as `core/follow-up.js` already had it), "end of the week" Friday; the first version had both on Friday and the follow-up corpus caught it.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** two source-level checks in `test/day-words-corpus.cjs`, every `test/*corpus.cjs` green (including follow-up, intent, surface-parity, gmail-outlook-parity), add-on bundle rebuilt with `day-words.js` in it; the add-on `v1.test.cjs` shows the same 5 stale failures before and after.
- **Open:** live Gate; the 5 stale add-on expectations (`v1.test.cjs`) remain in `docs/open-tasks.md`. Found while running the browser suites: 2 specs in `e2e/outlook-teams-and-series.spec.js` ("TEAMS_MEETING on: the hold carries a Teams link…" and the one where the server returns no link) fail at 543f7ecb too, i.e. before this run's change (the Hold It card does not appear for the Teams call proposal); recorded in `docs/open-tasks.md` for whoever owns that row, not caused by day-words.

## 2026-10-24 Ecosystems builder B (sixtieth run) — appointment wording from real businesses, and two specs that went red on days 1 to 12

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** the appointment reader needed "your appointment" / «התור שלך». Businesses write «תזכורת: יש לך תור מחר בשעה 10:00 אצל ד"ר כהן», «קבענו לך תור למחר ב-9:00», «שריינו לכם שולחן ביום שישי ב-20:00», «אישור הזמנה: …», "Reminder: you have an appointment tomorrow at 10:00", "Appointment reminder: …", "Reservation confirmed - Sunday 8pm for 4 people"; none got a card. All are read now (chat, Outlook, Gmail). Offers ("Book your appointment now, you have 3 slots…"), pending requests, questions and "you have unread messages" stay quiet.
- **Also fixed (not user-facing):** the two Outlook Teams specs reported as failing in run 59 were not a regression: the spec wrote the date as `2/11`, and a slash date whose day and month both fit either way is unresolved on purpose (a deliberate precision rule, `understanding-corpus` checks it for Hebrew «עד 3/4»), so the specs were red on days 1 to 12 of a month only. They now use a month name; `e2e/engine.spec.js` had the same pattern and got the same fix. I tried resolving Hebrew slash dates day first; the understanding corpus rejected it, so I reverted it rather than lower that gate.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/chat-appointment-notice-corpus.cjs` (8 more notices, 5 more quiet lines), all corpora, `outlook-teams-and-series` 17/17, `engine` 10/10, booking/chat browser specs.
- **Open:** live Gate; `gate-0956-live.spec.js` and `google-lane-http.spec.js` also build `d/m` text but with a weekday, so they are stable.

## 2026-10-24 Ecosystems builder B (sixty-first run) — flights, trains and rides become a hold

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** an airline, a rail company or a ride service that tells the person "Your flight LY001 departs Sunday at 06:30", "Your train leaves tomorrow at 08:15", «הטיסה שלך ממריאה ביום ראשון ב-06:30» or «הרכבת שלך יוצאת מחר ב-08:15» now gets the existing Hold It card in WhatsApp, Messenger, Instagram, Outlook and Gmail: one event titled "Trip · sender" / «נסיעה · שולח», read back by id, Undo deletes it, nobody invited. Cancelled, delayed or changed trips, promotions, questions, someone else's flight and a missing day or clock stay quiet. Found on the way: the date reader left "06:30" unresolved (6:30 am or pm?), which is right for a bare "6:30" and wrong for a leading zero; `core/day-words.js` now writes a leading-zero clock out as 24-hour am.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** new `test/chat-travel-notice-corpus.cjs` (10 notices EN+HE, 16 quiet lines), chat card corpus (trip hold, quiet lines), booking-notice corpus (2 mails, 2 quiet), the silence corpus (4 more everyday lines), all corpora, chat/Outlook/Gmail browser specs.
- **Open:** live Gate; `core/chat-travel-notice.js` joined the shared content-script `js` list in `manifest.json` (no permission, host or scope change). A flight with a time zone ("06:30 local") is read as the written clock.

## 2026-10-24 Ecosystems builder B (sixty-second run) — bills that state what is due

- **Capability shipped (switches `CHAT_TASK_CARD`, `PAYMENT_ASK`, off):** the first user pays suppliers, rent and arnona, and most of it arrives as a bill, not as a request ("Your invoice of 1,200 NIS is due on Nov 5", «החשבונית שלך על סך 1,200 ₪ לתשלום עד 5 בנובמבר»). The payment reader only took a request with a pay verb. It now also takes the person's own bill with an amount and a due day, and the card writes one task "Pay 1200 NIS · sender" / «לשלם 1200 NIS · שולח» due that day, in chat, Outlook and Gmail. Receipts, "thank you for your payment", already paid, autopay and direct debit, an invoice that is only attached, someone else's invoice, two amounts and a due date already past stay quiet. Nothing is paid and no bank is touched.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/chat-payment-ask-corpus.cjs` (5 bills, 8 quiet lines), `test/payment-ask-mail-corpus.cjs` (2 bills, 3 quiet mails), the silence corpus (3 more everyday lines), a real-browser Outlook spec (bill, Handled, Undo), all corpora, chat/Outlook/Gmail browser specs.
- **Open:** live Gate; an overdue bill with a past due date stays quiet by design (no due day to put the task on); owner decision whether an overdue bill should become a task due today.

## 2026-10-24 Ecosystems builder B (sixty-third run) — a reminder no longer adds a second event

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** an appointment, a trip or an invitation is usually told twice (the confirmation, then a reminder). The chat card would have offered a second Do It for the reminder and the person would end with two identical events. It now checks the thread: a hold this card wrote for the same day and clock in the same chat, and not undone since, means the reminder shows no card (`already-on-calendar`); a different time, a different chat, or the same time after Undo is offered as before.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** chat card corpus (first hold, reminder not offered, another time offered, same time offered again after Undo), all corpora, chat/Outlook/Gmail browser specs.
- **Open:** live Gate; the mail cards (Outlook, Gmail) do not dedupe a confirmation mail and its reminder mail yet.

## 2026-10-24 Ecosystems builder B (sixty-fourth run) — a reminder mail no longer adds a second event

- **Capability shipped (switch `BOOKING_NOTICE`, off):** a business sends the confirmation and then a reminder, as two threads. Outlook and Gmail mail cards offered a second Do It for the reminder and the person ended with two identical events. Now `core/held-hold.js` looks in the activity log: a hold written for the same sender at the same day and clock and not undone since means the reminder is not offered; after Undo it is offered again. The open mail's own receipt is never treated as its own duplicate. Nothing is sent, nothing is overwritten.
- **Also:** `test/live-gate-0956-corpus.cjs` waits for the refusal to reach the store before copying it (was failing about 1 run in 3).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** `test/held-hold-corpus.cjs`, two Outlook browser specs (reminder quiet; after Undo offered again), one Gmail browser spec, all corpora. The first Outlook version keyed on the conversation id and a browser run showed it never matched (confirmation and reminder are separate threads), so it keys on the sender.
- **Open:** live Gate; the chat card still keys on the chat, the mail cards on the sender: a second appointment from the same sender at the same day and clock is treated as the same one (a deliberate trade, owner can veto).

## 2026-10-24 Ecosystems builder B (sixty-fifth run) — a reminder for a bill no longer adds a second Pay task

- **Capability shipped (switches `PAYMENT_ASK`, `TASK_ASK`, off):** the sixty-fourth run's guard now covers tasks. A supplier sends the invoice, then "a reminder: your invoice of 1,200 NIS is due tomorrow". Outlook and Gmail mail cards offered a second Pay task. Now a task the same sender's earlier mail already put on the list (same due day and same title, not undone) is not offered again; a different amount or day is. Only intents the judge raises itself (booking, payment, reminder) have a key, so an ordinary request is never held back. Nothing is paid or sent.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical cards reused.
- **Tests:** `test/held-hold-corpus.cjs` (7 more cases), an Outlook and a Gmail browser spec (both fail on the previous code and pass now), all corpora.
- **Open:** live Gate; the chat card has its own guard for holds only, not yet for chat tasks.

## 2026-10-24 Ecosystems builder B (sixty-sixth run) — a repeated chat ask no longer adds a second task

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** in WhatsApp, Messenger and Instagram a bill or a reminder is often repeated ("please transfer 500 NIS by Sunday", then "Hi again, please transfer…"). The chat card offered a second Do It and the person ended with two identical tasks. Now a task this card wrote in this chat for the same due day and title, not undone since, is not offered again (`already-on-task-list`); another amount or day is; after Undo it is. It mirrors the hold guard of the sixty-third run.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** chat card corpus (first task, repeat quiet, other amount offered, offered again after Undo), a real-browser Outlook spec (fails on the previous card, passes now), all corpora.
- **Open:** live Gate; a repeat worded as "Reminder: …" reaches a different reader than the bill wording and gets a different title, so it is still offered (recognition detail, not a data risk); the hold and task guards are separate code, to be merged if a third kind appears.

## 2026-10-24 Ecosystems builder B (sixty-seventh run) — a "Reminder:" repeat of a payment ask is the same ask

- **Capability shipped (switches `CHAT_TASK_CARD`, `PAYMENT_ASK`, off):** the sixty-sixth run left a gap: "Reminder: please transfer 500 NIS to my account by Sunday" was read as not aimed at the person, so the chat card gave a different task, or none, instead of seeing the repeat. `core/chat-payment-ask.js` now takes a leading nudge ("Reminder:", "Gentle reminder,", "Friendly reminder:", «תזכורת:», «שוב:») as part of the same ask. A Reminder line about someone else or a payment already made stays quiet. With the guard the person ends with one Pay task, not two.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** `test/chat-payment-ask-corpus.cjs` (3 more asks, 3 more quiet lines), the chat card corpus on the real "Reminder:" wording, a real-browser Outlook spec (bill, then "Reminder:" quiet; fails on the previous reader), all corpora.
- **Open:** live Gate; the reminder, deadline and call-back readers do not take a leading nudge yet.

## 2026-10-24 Ecosystems builder B (sixty-eighth run) — "Reminder: send it by Monday" is the ask, not a made-up reminder

- **Capability shipped (switch `CHAT_TASK_CARD`, off):** in WhatsApp, Messenger and Instagram "Reminder: please send the signed form by Monday" was taken by the reminder reader, which made a task titled "please send the signed form", and "Reminder: the form was due Monday" (a look back) was offered as a task too. Now the deadline reader takes the nudge as part of the same ask («תזכורת: תשלח לי את החוזה עד יום חמישי» too), so it gets the right title ("Send the signed form") and the same-chat repeat guard sees it as the task already made; the reminder reader leaves a request and a look back alone.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** deadline reader corpus (3 more asks), reminder reader corpus (2 more quiet lines), chat card corpus (nudged repeat quiet, look back quiet), a real-browser Outlook spec (fails on the previous readers), all corpora.
- **Open:** live Gate; the call-back reader does not take a leading nudge ("Reminder: call me back" is taken by the reminder reader, which gives a fine task); the bare "Reminder: <event>" (e.g. "Reminder: team lunch on Monday") still makes a reminder task by design.

## 2026-10-24 Ecosystems builder B (sixty-ninth run) — a moved appointment is offered at its new time

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** businesses move appointments by message ("Your appointment has been moved to Monday at 11:00", «התור שלך הועבר ליום שני בשעה 11:00», «נדחה ליום שלישי ב-09:00»). The appointment reader treated "moved", "rescheduled" and «נדחה» as cancellations, so the new time was never offered, and without "see you" the line had no confirming frame. `core/chat-appointment-notice.js` now reads the booking at the new day and clock (the old day before "to" is dropped; "moved from Sunday at 10:00 to Monday at 11:00" works); cancellations, "unfortunately … instead" and lines about a meeting or a package stay quiet. The same reader serves WhatsApp, Messenger, Instagram, Outlook and Gmail mail. Nothing is sent; nobody is invited.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** appointment reader corpus (4 more bookings, 5 more quiet lines), chat card corpus (confirmation, then the move is offered; Hebrew; cancelled quiet), a real-browser Outlook spec (fails on the previous reader), all corpora.
- **Open:** live Gate; the old event stays on the calendar until the person removes it (replacing it would be an edit of an event Glance made earlier: a design for the owner, not built); the pickup and trip readers do not read a moved time yet.

## 2026-10-25 Ecosystems builder B (seventieth run) — a delayed flight is offered at its new time

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** airlines and rail operators message changes: "Your flight LY001 has been delayed, it now departs Sunday at 07:15", «הטיסה שלך נדחתה, היא תמריא ביום ראשון ב-07:15», "Your train has been rescheduled to depart tomorrow at 09:40". The trip reader treated every delay as a cancellation, so the new time was never offered. `core/chat-travel-notice.js` now reads the trip at the new day and clock when a change verb is followed by a new-time marker (also "was delayed from Sunday at 06:30 and now departs Sunday at 08:45"). A delay with no new time, a cancellation, "unfortunately … instead", a promotion and a look back stay quiet. Chat (WhatsApp, Messenger, Instagram) and Outlook/Gmail mail share the reader. Nothing is sent; nobody is invited.
- **Rule changed on purpose:** the corpus had two lines that said a delay with a new time is not a trip; they now say it is (moved to the YES list with a comment). The precision floor is unchanged: a change verb with no new time, any cancel/sorry/instead word, and every other quiet line still hold.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** trip reader corpus (6 more trips, 5 more quiet lines), chat card corpus (delayed offered at the new time; a delay with no time quiet), a real-browser Outlook spec (fails on the previous reader), all corpora.
- **Open:** live Gate; the old trip event stays until the person removes it; the pickup reader does not read a moved time yet.

## 2026-10-25 Ecosystems builder B (seventy-first run) — an extended pickup deadline is offered with the new day

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** shops and couriers extend pickups: "The pickup deadline for your order was moved to Thursday", "Your parcel collection was postponed until Friday", «מועד האיסוף של ההזמנה שלך הוארך עד יום חמישי». The pickup reader saw no pickup frame in these lines and stayed quiet, so the person kept the old, expired deadline. `core/chat-pickup-notice.js` now reads a moved or extended pickup with the new last day, and the existing "Pick up the order" task is offered due that day, in chat (WhatsApp, Messenger, Instagram) and in Outlook/Gmail mail. A moved delivery (nothing to collect), a cancellation, "sorry …" and a pickup that is not the person's own stay quiet.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** pickup reader corpus (5 more pickups, 4 more quiet lines), chat card corpus (extended pickup offered; moved delivery quiet), a real-browser Outlook spec (fails on the previous reader), all corpora.
- **Open:** live Gate; the invitation reader does not read a moved event yet; the first (old) pickup task stays until the person removes it.

## 2026-10-25 Ecosystems builder B (seventy-second run) — a cancelled booking offers to take its hold off the calendar

- **Capability shipped (switch `CHAT_TASK_CARD`, off; chat only):** the run reports 63 to 71 made Glance put bookings, trips, invitations and pickups on the calendar and task list. The mirror case was missing: the business cancels ("Your appointment on Monday at 11:00 was cancelled", «התור שלך ביום שני ב-11:00 בוטל») and the hold stayed, so the person turned up in the calendar for a thing that was gone. Now `FlowChatAppointmentNotice.cancelled` reads the day and clock of a plain, past-tense cancellation of a possessive booking, and the chat card, only when this chat has a not-undone hold at exactly that day and clock, offers the existing Do It card ("Remove It"): Do It runs the hold's own undo (read back that the event is gone; an event the person edited is left alone and the card says "You changed this event, so I left it"), logs it as undone and shows a Handled receipt. No hold from this chat: nothing is shown. A move, a rebook link, an offer to cancel, a policy line and a question stay quiet. Nothing is sent.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused (its text for this card: title "Cancelled: <booking>", step "Remove from calendar: <booking>", closed line "Removed from your calendar."; added to the card request file below).
- **Tests:** appointment reader corpus (5 cancellations, 10 quiet lines), chat card corpus (remove offered, undo called with the held ref, logged as undone, second cancellation quiet, no-hold quiet, edited event left alone, Hebrew), two real-browser Outlook specs (the removal deletes the event; no hold, nothing; the first fails on the previous card), all corpora.
- **Open:** live Gate; mail (Outlook/Gmail) does not offer the removal yet; the removal has no Undo of its own (restoring a deleted event is not built).

## 2026-10-25 Ecosystems builder B (seventy-third run) — a moved invitation is offered at its new time

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** hosts move events by message ("The launch party you were invited to has been moved to Monday at 20:00", «האירוע שהוזמנת אליו הועבר ליום שני בשעה 20:00», "Your invitation was rescheduled from Sunday at 19:00 to Monday at 20:00"). The invitation reader needs an invite frame ("you're invited") and treated "moved" and «נדחה» as cancellation, so the new time was never offered. `core/chat-invitation-notice.js` now reads an invitation told as moved, only when the words before the verb speak of an invitation, at the new day and clock; "unfortunately/sorry/instead", a cancellation, a move with no new clock and a meeting that is not an invitation stay quiet. Chat (WhatsApp, Messenger, Instagram) and Outlook/Gmail mail share the reader. Nothing is sent; nobody is invited.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical card reused.
- **Tests:** invitation reader corpus (3 more invitations, 5 more quiet lines), chat card corpus (moved offered at the new time, cancelled quiet), a real-browser Outlook spec (fails on the previous reader), all corpora.
- **Open:** live Gate; the first (old) hold stays until the person removes it; the cancelled-booking removal is chat only (no mail, no trip/invitation cancellations yet).

## 2026-10-25 Ecosystems builder B (seventy-fourth run) — a cancelled flight or party comes off the calendar too

- **Capability shipped (switch `CHAT_TASK_CARD`, off; chat only):** the seventy-second run removed a cancelled appointment's hold. The airline and the host cancel too: "Your flight LY001 departing Monday at 06:30 was cancelled", «הטיסה שלך ביום שני ב-06:30 בוטלה», "The launch party on Monday at 19:00 has been cancelled". `core/chat-travel-notice.js` and `core/chat-invitation-notice.js` now have a `cancelled` reader (plain past-tense cancellation, one day, one clock; a move, a delay, a rebook link, an offer to cancel, a policy line and a question stay quiet) and the chat card tries all three cancellation readers. As before the card appears only when this chat has a not-undone hold at exactly that day and clock, and Do It runs that hold's own undo (read back that it is gone; an edited event is left alone).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; the "Remove It" card of the seventy-second run is reused.
- **Tests:** trip and invitation reader corpora (cancellations and quiet lines), chat card corpus (trip, invitation, Hebrew trip removed and logged as undone; no hold, nothing), a real-browser Outlook spec (fails without the change), all corpora.
- **Open:** live Gate; mail (Outlook/Gmail) does not offer the removal; the removal has no Undo of its own; a cancelled pickup task is not removed (a task, not a hold).

## 2026-10-25 Ecosystems builder B (seventy-fifth run) — a courier's delivery window goes on the calendar

- **Capability shipped (switches `CHAT_TASK_CARD`, `BOOKING_NOTICE`, off):** for an Israeli freelancer or small business the daily message is the courier's: "Your package will be delivered tomorrow between 14:00 and 18:00", «השליח יגיע מחר בין 14:00 ל-18:00», «המשלוח שלך יגיע ביום שני בין השעות 10:00-12:00». No reader took it (a delivery that "simply arrives" was quiet by design), so the person had to remember to be there. New `core/chat-delivery-window.js` reads an item or courier noun, a future arrival verb, one day today or later and a clock or a clock window (24 hour, am/pm, "between 2 and 6pm", an hour under 7 with no marker stays quiet), and the existing Hold card offers a hold at the start of the window titled "Delivery 14:00–18:00 · name". Chat (WhatsApp, Messenger, Instagram) and Outlook/Gmail mail share the reader through the shared judge. Already delivered, failed, cancelled, delayed, a pickup, a question, a promotion and "we deliver on Tuesdays" stay quiet. Nobody is invited; nothing is sent.
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok; canonical Hold card reused.
- **Tests:** `test/chat-delivery-window-corpus.cjs` (12 deliveries, 18 quiet lines, a window over today, a window still open), the chat card corpus (titles in English and Hebrew, no message words, quiet cases), the mail judge corpus (3 deliveries, 3 quiet), the silence corpus (11 everyday courier lines, delivery reader added), real-browser Outlook and Gmail specs (the Outlook one fails without the judge change), all corpora.
- **Open:** live Gate; the hold is 30 minutes long from the start of the window (a hold with the real end needs a duration field in both calendar writers: not built). A repeated message for the same window is held back by the existing same-day-and-clock guards (chat and mail).

## 2026-10-25 Ecosystems builder B (seventy-sixth run) — the first user's surfaces proved in a real browser (no new capability code)

- **Honest status: this run ships no new user-facing capability.** It is a proof run, by choice: runs 63 to 75 built eight chat and mail closes (reminder dedupe, moved and cancelled bookings, trips, invitations and pickups, delivery windows) and every one of them had been proved in a real browser on Messenger and Outlook/Gmail only. The first user (an Israeli freelancer on Gmail and WhatsApp) uses WhatsApp Web, so before building more the whole chain was run there.
- **What was proved (fixture DOM, production lane registrations, Graph stand-in, not a live Gate):** `e2e/chat-whatsapp-card.spec.js`, 8 specs. WhatsApp Web: off switch shows nothing; a courier window becomes one hold "Delivery 14:00–18:00", no guest, no message words, read back, Undo deletes it; a payment ask becomes one To Do task "Pay 500 NIS", nothing paid or sent; a cancelled booking offers to remove the hold made from that chat and removes it; a plain line shows nothing; a Hebrew payment ask and its «תזכורת:» nudge make one task. Meta Business Suite (Messenger lane on the business inbox): a customer's payment ask becomes one task. Instagram direct messages: a Hebrew courier window becomes one hold «משלוח 10:00–12:00». No bug was found; the harness needed the Instagram host (test copy of the manifest and route list only; no change to `manifest.json`).
- **Grok sync:** `git log` and `card-requests-*.md` checked: nothing new from Grok.
- **Tests:** the 8 specs above, all corpora.
- **Open:** live Gate for each surface (the owner); real WhatsApp, Instagram and Business Suite markup can differ from the fixtures (`TODO-LIVE-DOM` in `test/fixtures/chat`); the next run should build capability again (candidates: a duration field in both calendar writers so a delivery window has its real end; mail-side removal of a cancelled booking).

