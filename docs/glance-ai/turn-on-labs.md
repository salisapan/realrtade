# Why you do not see most of what was built, and how to see it

Glance closes open loops. Gmail is where it starts today.

Most closes built since 2026-10-20 ship behind an off switch (shared rule: a routine never turns a switch on). All of them are off in your browser until you turn them on, so a live check shows the old product. The switches live in one storage object, `glanceSwitches`, in the extension's storage. A missing key is off (`src/background.js`, `glanceSwitchOn`).

**Switches and what each turns on (status 2026-10-24; none passed a live Gate)**

| Switch | What it makes visible |
|---|---|
| `TASK_ASK` | A reminder, a deadline or a call-back ask written without a question becomes a task due that day |
| `PAYMENT_ASK` | "Please transfer 500 NIS by Sunday" becomes a task with the amount and the day |
| `BOOKING_NOTICE` | A confirmed appointment, a pickup notice, an invitation or a trip becomes a hold |
| `SYSTEM_NOTICE` | A notice with a deadline and a preventing action ("your project will be paused") becomes a task |
| `CHAT_TASK_CARD` | WhatsApp, Messenger and Instagram: an ask in a chat gets a Do It card |
| `CHAT_PROMISE_CARD` | A promise made to you in a chat is logged as "Waiting on" |
| `MEET_LINK`, `EVENT_CALL_LINK` | A Google Meet link on a proposed call, and on an existing event |
| `TEAMS_MEETING`, `OUTLOOK_EVENT_CALL_LINK` | A Teams link on a proposed call, and on an existing Outlook event |
| `RECURRING_HOLD`, `RECURRING_REMINDER`, `RECURRING_TODO` | A stated repeat becomes a series, a recurring reminder, a repeating To Do |
| `WORKSPACE_FILE` | An empty Google Doc, Sheet or Slides deck from a named request |
| `ONEDRIVE_NEW_FILE` | An empty Word or Excel file from a request |
| `PLANNER_TASK` | A task in a named Planner plan |

**Turn them on for your own test browser (your decision, not an agent's).** Open `chrome://extensions`, turn on Developer mode, click "service worker" under Glance, and paste this in the console. Then reload the Gmail, Outlook or WhatsApp tab.

```js
chrome.storage.local.get({ glanceSwitches: {} }).then((b) => chrome.storage.local.set({
  glanceSwitches: Object.assign({}, b.glanceSwitches, {
    TASK_ASK: true, PAYMENT_ASK: true, BOOKING_NOTICE: true, SYSTEM_NOTICE: true,
    CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true,
    MEET_LINK: true, EVENT_CALL_LINK: true, TEAMS_MEETING: true, OUTLOOK_EVENT_CALL_LINK: true,
    RECURRING_HOLD: true, RECURRING_REMINDER: true, RECURRING_TODO: true,
    WORKSPACE_FILE: true, ONEDRIVE_NEW_FILE: true, PLANNER_TASK: true
  })
})).then(() => console.log('Glance labs on'));
```

To turn one off, set it to `false` the same way. Some need a connection or a scope you ticked once (Google for Meet, Docs and Sheets; Microsoft for Teams, To Do, Planner and OneDrive).

**What to try in five minutes (report what you saw, one line each)**
1. Gmail, a mail with "Please transfer 500 NIS by Sunday": a task card, Handled after Do It, Undo works.
2. Gmail, a mail "Can we do a video call tomorrow at 15:00?": a hold with a Meet link.
3. Gmail, a mail "תוכל לאשר לי את ההצעה עד מחר?": a task titled "אישור נדרש", no reply draft.
4. Outlook, a mail with a confirmed appointment: a hold.
5. WhatsApp Web (after the opt-in), a contact writes "תשלח לי את הדוח עד חמישי": a Do It card, then Handled.
6. Anything that looks wrong: say which, and the switch name from the table.

**Not fixed by this page.** A one-click panel for these switches in the extension itself does not exist; it is the first item of builder A's backlog (a plain list of checkboxes in the existing popup style, off by default, with a note that each one is not live-tested).
