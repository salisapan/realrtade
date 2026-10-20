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

