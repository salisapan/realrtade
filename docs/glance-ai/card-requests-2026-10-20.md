# Card requests for four new closes (for the Grok bot)

Glance closes open loops. Gmail is where it starts today.

Owner, 2026-10-20: designs belong to the Grok bot. This page lists what each of four new cards has to show. It does not design anything. Every card is Glance's own card and steps list, with the canonical Do It (`docs/design-principles.md`). There is no new page, form or settings screen, and the cards follow Dana's design system (`docs/vault/shared-rules.md`).

The logic is merged and covered by tests. Each close is off behind its switch until a card exists, the code is wired, and the owner runs the live Gate. The text strings below come from the code. A design may restyle them. If a design changes the wording, the change goes into the module, and the corpus is updated in the same commit.

The words "Handled" / "טופל" appear only after the read-back (`fetchedBack`). A card never says the ask is closed when only a step is done.

## U2 — a file that is only on the person's computer

- Module `flow-trial-extension/core/local-file.js`, switch `LOCAL_FILE_CLOSE`. Map row U2.
- When the card shows: someone asked for one file, the cloud search found nothing, and exactly one file in the person's granted folder fits.
- Line: `מצאתי את <file> במחשב. לשמור עותק ב-OneDrive כדי שיהיה מוכן לשליחה?` / `Found <file> on your computer. Save a copy to OneDrive so it is ready to send?`
- Steps: `קריאת הקובץ מהמחשב` / `Read the file on this computer`, then `שמירה ב-OneDrive ובדיקה חוזרת` / `Save to OneDrive and read it back`, then `שליחה, אחרי תצוגה מקדימה` / `Send, after a preview`. The send step is shown as not yet available, because Mail.Send is not built.
- Action: one Do It.
- Undo: deletes the copy. If the person changed the copy, the card says Undo unavailable.
- Still needed outside the card: a one-time folder grant, and its privacy text (owner).

## F2 — the file they asked for, found in the person's OneDrive

- Module `flow-trial-extension/core/onedrive-find.js`, switch `ONEDRIVE_FIND`. Map row F2.
- Where: Outlook only.
- Line: `מצאתי את <file> ב-OneDrive שלך. לצרף לטיוטת התשובה?` / `Found <file> in your OneDrive. Attach it to the reply draft?`
- Steps: `נמצא ב-OneDrive` / `Found in OneDrive`, then `מצורף לטיוטת התשובה` / `Attached to the reply draft`, then `שליחה, אחרי תצוגה מקדימה` / `Send, after a preview` (not yet available).
- Action: one Do It. The draft is preparation: the ask stays open until a sent message carries the file.
- Undo: removes the attachment from the draft. The OneDrive file is never touched.

## D4 — a row in the sheet they named

- Module `flow-trial-extension/core/sheet-row.js`, switch `SHEET_ROW`. Map row D4.
- Line: `לרשום <amount> ב<sheet>?` / `Add <amount> to <sheet>?`
- Steps: `קריאת שורת הכותרת` / `Read the header row`, then `הוספת שורה ובדיקה חוזרת` / `Add the row and read it back`.
- Action: one Do It. The row in the sheet is the close.
- Undo: deletes the row. If the person edited the row, the card says Undo unavailable and the row stays.
- Still needed outside the card: the `spreadsheets` scope and its privacy text (owner).

## C5 — answer an invite that is on the calendar

- Module `flow-trial-extension/core/rsvp.js`, switch `RSVP_REPLY`. Map row C5.
- Line: `לענות על ההזמנה: <event> (<date>)` / `Answer the invite: <event> (<date>)`
- Choices: `מגיע/ה` · `אולי` · `לא מגיע/ה` / `Accept` · `Maybe` · `Decline`. Nothing is selected in advance. This is a quick-choice card (`docs/vault/shared-rules.md`, "one-question quick-choice widgets").
- Step: `התשובה נרשמת ביומן ונבדקת` / `Record the answer on the event and read it back`.
- Glance sends no email. The organizer sees the answer on the event, the same as with the invite's own buttons.
- Undo: puts the previous answer back. If the person changed the answer themselves, the card says Undo unavailable.

## M1 — a call held on the calendar with a Meet link

- Module `flow-trial-extension/core/meet-link.js`, switch `MEET_LINK`. Ecosystem gap "Meet link on a hold" (`docs/glance-ai/ecosystem-coverage.md`).
- When the card shows: someone proposed a video call with one day and one clock ("Can we do a video call tomorrow at 15:00?"). Two clocks, an alternative, a hedge, Zoom or Teams named, and "ask Dana to set it up" show no card.
- Line: `לקבוע ביומן שיחת וידאו ב-<date> <HH:mm> עם קישור Meet?` / `Hold <date> <HH:mm> on your calendar with a Meet link?`
- Steps: `יצירת האירוע עם קישור Meet ובדיקה חוזרת` / `Create the event with a Meet link and read it back`, then `שליחת הקישור: על פי בחירתך, גלאנס לא שולח` / `Share the link: your choice, Glance does not send` (shown as the person's own step).
- Action: one Do It. After the read-back the receipt shows the link (`meetUrl`) with a Copy control, and the calendar link.
- No guest is added, so no invitation goes out from Glance. The ask is not marked closed by the hold alone: `loopClosed` is false, and "Handled" for the call itself waits for the other person's answer.
- Undo: deletes the event. If the person edited it (agenda, guest, title, time), the card says Undo unavailable and the event stays.

## T1 — a call held on the Outlook calendar with a Teams link

- Module `flow-trial-extension/core/teams-meeting.js`, switch `TEAMS_MEETING`. Ecosystem gap "Teams meeting link" (`docs/glance-ai/ecosystem-coverage.md`). The Outlook twin of M1; same card shape, same canonical Do It.
- When the card shows: an Outlook mail proposes a call (a generic video call or a Teams call) with one day and one clock. Two clocks, an alternative, a hedge, Zoom or Google Meet named, and "ask Dana to set it up" show no card.
- Line: `לקבוע ביומן שיחה ב-<date> <HH:mm> עם קישור Teams?` / `Hold <date> <HH:mm> on your calendar with a Teams link?`
- Steps: `יצירת האירוע עם קישור Teams ובדיקה חוזרת` / `Create the event with a Teams link and read it back`, then `שליחת הקישור: על פי בחירתך, גלאנס לא שולח` / `Share the link: your choice, Glance does not send` (the person's own step).
- Action: one Do It. After the read-back the receipt shows the join link (`joinUrl`) with a Copy control, and the calendar link. The card asks nothing new: the Calendar box (`Calendars.ReadWrite`) is the existing consent, and the plan reports `no-calendar-scope` if it is not ticked.
- No guest is added, so no invitation goes out from Glance. `loopClosed` is false: Handled for the call itself waits for the other person's answer.
- Undo: deletes the event. If the person edited it (agenda, guest, subject, time), the card says Undo unavailable and the event stays.

## W1 — an empty Doc, Sheet or Slides deck created from a request

- Module `flow-trial-extension/core/workspace-file.js`, switch `WORKSPACE_FILE`. Ecosystem gap "create a Doc or Sheet from a request" (`docs/glance-ai/ecosystem-coverage.md`).
- When the card shows: someone asked the person to set up a doc, agenda, sheet or tracker and gave it a name or a topic ("Can you create a shared doc called Q4 launch plan?"). No name, a request to write the content, Word or Excel, or an existing file shows no card.
- Line: `ליצור <מסמך|גיליון|מצגת> ריק בשם "<name>" ב-Drive?` / `Create an empty <doc|sheet|slide deck> called "<name>" in your Drive?`
- Steps: `יצירת הקובץ ב-Drive ובדיקה חוזרת` / `Create the file in Drive and read it back`, then `שיתוף והוספת תוכן: על פי בחירתך, גלאנס לא כותב ולא משתף` / `Share it and add content: your choice, Glance does not write or share` (the person's own step).
- Action: one Do It. The receipt shows the file name and an Open link (`url`).
- Undo: moves the file to the trash. If the person typed in it, the card says Undo unavailable and the file stays.

## W2 — an empty Word or Excel file made in OneDrive (WIRED 2026-10-21 into the existing card, no new design needed)

- Module `flow-trial-extension/core/onedrive-new-file.js`, switch `ONEDRIVE_NEW_FILE`. Ecosystem gap "Word / Excel from a request" (`docs/glance-ai/ecosystem-coverage.md`, row 76 part 8). The Outlook twin of W1; same card shape, same canonical Do It.
- When the card shows: an Outlook mail explicitly asks for a new doc, tracker or sheet with a name ("Can you create a Word document called Supplier onboarding?"). No name, a request to write the content, an existing file, a hedge, "ask Dana to create it", and another app named (Google, Notion, OneNote) show no card.
- Line: `ליצור <מסמך Word | חוברת Excel> ריק בשם "<file>" ב-OneDrive?` / `Create an empty <Word document | Excel workbook> called "<file>" in your OneDrive?`
- Steps: `יצירת הקובץ ב-OneDrive ובדיקה חוזרת` / `Create the file in OneDrive and read it back`, then `שיתוף והוספת תוכן: על פי בחירתך, גלאנס לא כותב ולא משתף` / `Share it and add content: your choice, Glance does not write or share` (the person's own step).
- Action: one Do It. After the read-back the receipt shows `Word · <file>` or `Excel · <file>` with the OneDrive link. The card asks nothing new: the OneDrive box (`Files.ReadWrite`) is the existing consent; without it the plan reports `files-not-granted`.
- A name already taken in OneDrive > Glance is refused (`name-taken`), nothing is replaced. The card should say the name is used and leave the choice to the person.
- Undo: deletes the file. If the person edited it, the card says Undo unavailable and the file stays.

## P1 — a task added to a named Planner plan

- Module `flow-trial-extension/core/planner-task.js`, switch `PLANNER_TASK`. Ecosystem gap "Planner" (`docs/glance-ai/ecosystem-coverage.md`). Outlook only (Microsoft account).
- When the card shows: someone asked the person to add a task with a title to a plan that is named and is one of the person's own plans ("Please add the task 'Send contract to Dana' to the Website relaunch plan by Friday"). No plan named, an unknown or two same-named plans, or another tool shows no card.
- Line: `להוסיף ל-Planner, בתוכנית <plan>, משימה: <title> (עד <date>)?` / `Add to Planner, in the <plan> plan, the task: <title> (due <date>)?` The date part appears only when the mail gave one.
- Step: `יצירת המשימה בתוכנית ובדיקה חוזרת (בלי לשייך לאף אחד)` / `Create the task in the plan and read it back (assigned to no one)`.
- Action: one Do It. The task has no assignee, so Planner notifies nobody.
- Undo: deletes the task. If the person changed it, the card says Undo unavailable and the task stays.
- Needed outside the card: the host reads the person's plans (`GET /me/planner/plans`, `Tasks.ReadWrite`, already requested when the To Do box is ticked; the Entra app must list it, open-tasks row 44).
- Update 2026-10-21: the Meet link now rides on the existing Gmail Hold It when `glanceSwitches.MEET_LINK` is on. The worker result carries `meetUrl` (also `joinUrl`) and the receipt row ends with `· Meet`. The card should show the link with a Copy control, as for Teams. Without the switch nothing changes.

## T1 — a repeating reminder on the calendar

- Module `flow-trial-extension/core/recurring-reminder.js`, switch `RECURRING_REMINDER`. Map row T1.
- When the card shows: a mail asks the person (or the person commits) to do something on a stated repeat, with a clock: "Please send me the weekly sales report every Monday at 9:00", "Send the VAT summary on the 15th of each month at 10:00". No clock, two repeat rules, "every other", quarterly, or a past habit shows no card.
- Line: `ליצור ביומן תזכורת חוזרת (<כל יום ראשון 09:00>): <commitment>?` / `Add a repeating reminder to your calendar (<every Monday 09:00>): <commitment>?`
- Step: `יצירת האירוע החוזר ובדיקה חוזרת (בלי מוזמנים)` / `Create the repeating event and read it back (no guests)`.
- Action: one Do It. The receipt names the rule (for example `FREQ=WEEKLY;BYDAY=MO`) and the first date, with the calendar link. It does not say the ask is closed: each occurrence is still the person's to do.
- Undo: deletes the whole series. If the person edited it (note, day, time, guests), the card says Undo unavailable and the series stays.

## M2 — a Meet link added to an event that is already on the calendar

- Module `flow-trial-extension/core/event-call-link.js`, switch `EVENT_CALL_LINK`.
- When the card shows: someone asked the person to add a call link to an event they organize ("Can you add a Meet link to the Thursday sync?") and exactly one such event fits. An event with a link already, an event someone else organizes, Zoom or Teams named, or two events that fit shows no card.
- Line: `להוסיף קישור Meet לאירוע: <event> (<date>)?` / `Add a Meet link to the event: <event> (<date>)?`
- Step: `יצירת קישור Meet על האירוע ובדיקה חוזרת` / `Create a Meet link on the event and read it back`.
- Action: one Do It. The receipt shows the link (`meetUrl`) with a Copy control and the calendar link. Glance does not send the link to anyone; guests' own calendars show it the way they show any edit, and no email goes out from Glance.
- Undo: removes only the Meet link. If the person edited the event or changed the link, the card says Undo unavailable and nothing is removed.

## M3 — a Teams link added to an Outlook event that is already on the calendar

- Module `flow-trial-extension/core/outlook-event-call-link.js`, switch `OUTLOOK_EVENT_CALL_LINK`. Outlook only. The twin of M2.
- When the card shows: someone asked the person to add a call link to an event they organize ("Can you add a Teams link to the Thursday sync?") and exactly one such event fits. An event that is already online, an event someone else organizes, Zoom or Meet named, or two events that fit shows no card.
- Line: `להוסיף קישור Teams לאירוע: <event> (<date>)?` / `Add a Teams link to the event: <event> (<date>)?`
- Step: `יצירת קישור Teams על האירוע ובדיקה חוזרת` / `Create a Teams link on the event and read it back`.
- Action: one Do It. The receipt shows the link (`joinUrl`) with a Copy control and the calendar link. Glance sends the link to no one.
- Undo: turns the online meeting off. If the person edited the event or changed the link, the card says Undo unavailable and nothing is removed.
- Update 2026-10-21 (T1): the same repeat now also rides on the existing Gmail Hold It when `glanceSwitches.RECURRING_HOLD` is on and the mail states one repeat that the hold's date is an occurrence of ("Weekly sync every Tuesday at 10:00"). The result's `written` ends with the frequency (for example `· weekly`) and carries `recurrence` (the rule). The card should say it repeats, in the receipt row. Undo deletes the whole series if unedited. Without the switch nothing changes.
- Update 2026-10-21 (P1): no new card. Under the shared rule of 2026-10-21 the Planner destination is wired on the existing Outlook To Do card (the card, its Do It and its Undo are unchanged), behind `glanceSwitches.PLANNER_TASK`. The one text slot to fix: the line under the receipt still says `Undo removes the To Do task` for a Planner task; it should say `Undo removes the Planner task`.

