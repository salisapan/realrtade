# Holistic close map — Glance (personal)

## Owner lock 2026-10-08: broad, does everything

On 2026-10-08 the owner (Sali) locked this rule: Glance has to be broad and do everything. It must not be narrowed to a minimal set of loops.

- 11:25: «חייב להיות פה הרבה מעבר לשמירה בדרייב והוספה למשימות... המוצר חייב להיות הרבה יותר הוליסטי»
- 11:26: «אם המוצר לא יודע לעשות הכל הוא לא שווה כלום!»
- 12:16: «זה כלל. הוא חייב להיות רחב ולעשות הכל!»

A user's intent, wherever the user is (the floating extension on any site, plus the user's own computer), is closed end to end and proven. It is not enough for one kind of loop to work well. Red lines are unchanged: never auto-send (always a preview and one click), and every close needs ProofOfClose plus fetchedBack plus Undo. Netlify and Morning still require the owner's «מאשר».

Glance closes open loops. Glance's entry point is any surface the user is on.

This page is Glance only. Flow, the org product, is separate. This is an analysis of the personal product. It does not change the release order in `CLAUDE.md` or `docs/open-tasks.md`.

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Gmail is the current primary entry surface. Execution happens in the place a close really finishes. Glance stays silent when it is uncertain, never sends on its own, treats a draft as unfinished, and counts a loop closed only on real completion or a deliberate release.

Owner locks around that block (`CLAUDE.md`, 2026-10-06 to 2026-10-08):

- Glance follows the person as a floating extension across every site, plus a layer on their own computer (the browser on that machine, and local documents). It is not a standalone website.
- You intend, we execute: see the intent, show one Do It card, finish with a deterministic close.
- A loop is closed only with ProofOfClose: `{system, externalId, fetchedBack, verifiedAt}`, then the receipt remounts, and Undo exists where the write can be reversed (`docs/true-close.md` §7).
- One Instinct-style consent per ecosystem. Select all, plus one checkbox per service. Google: Drive, Docs, Sheets, Calendar, Gmail, Tasks, Contacts, Slides. Microsoft: Outlook, Calendar, OneDrive, Word, Excel, Teams, Contacts, To Do.
- Any send (`Mail.Send` and the same idea in a chat) is a preview and one click. Nothing is sent by itself.
- Multi-step means the ask is actually finished. Issuing an invoice in Morning (Green Invoice / חשבונית ירוקה) is that kind of finish. A draft that still needs the person is not.
- The next locked scenario after that send preview: intent on any site. Example: on WhatsApp Web or Messenger a friend asks where last week's restaurant was. Glance finds it in connected sources and drafts the reply in the chat. The person approves the send (`docs/open-tasks.md` row 54).
- Suggest-save: offer to save an email attachment even when nobody asked. A suggestion card. Never automatic.
- Morning (invoices) and a Netlify deploy stay on hold until the owner writes «מאשר».

## Current implementation status (this tip)

Manifest version **0.9.40**. That package is the narrow engine on top of 0.9.39: normalize once before the decision, reply-rule fixes, and the suggest-save engine with nothing drawn. The 0.9.39 live Gate passed on cd524a30. The Gate for 0.9.40 has not been run live.

Live Gates that have passed are single writes:

| Gate | What Do It did | Proof | Where |
|---|---|---|---|
| 0.9.30 | Gmail ask becomes a Google Task | GET the task, then Handled. Undo deletes it | `docs/open-tasks.md` row 46, `core/proof-of-close.js` (`google/tasks`) |
| 0.9.31, re-checked 0.9.39 | Outlook task-only close becomes a Microsoft To Do task | GET the task. Undo deletes it | row 47, `microsoft/todo` |
| 0.9.37, re-checked 0.9.39 | One attached file saved to OneDrive | GET the item. Undo deletes it or restores the previous version | row 49, `microsoft/onedrive` |
| Reply draft | Gmail or Outlook draft | A draft is not a close. Undo deletes the draft | `src/background.js` `gmailDraftWrite`, `outlookDraftWrite` |
| Undo | The write above is removed and Activity drops HANDLED | The same id | rows 46, 47, 49 |

Row 52 is the steps-list UI: a checklist with Suggested and Added, on Gmail and Outlook, with suggest-save visible. This map calls that slice **0.9.41**, because the name 0.9.40 is already the narrow package. Row 52 still says "0.9.40 steps-list" in the task list. That label collision is bookkeeping. The list is not shipped.

There is no separate steps-list spec file in the repo. The list's save step is suggest-save spec §8: `attachmentSave` is the only save step (`glance-ai/oss/veto/propose-gate.cjs`). Spec §9 is the chip copy in `core/suggest-save.js`. The page does not call `attachmentSaveWrite` in this package (`src/background.js`).

## How to read a row

**Now** is this tip, not the vision.

| Now | Meaning |
|---|---|
| live | A live Gate passed, or the write is on the Do It path and Handled waits for `fetchedBack`. |
| partial | Code and usually a corpus. No passed live Gate, or the step prepares and does not close. |
| none | No close path. |
| quiet | The correct result is silence. Building a card here would be a wrong Do It. |

**Score** = Value × Frequency × Feasibility × (6 − Risk). Each axis is 1–5. Value is how much a true close changes the day. Frequency is a judgment for a busy person, not telemetry (the repo has no usage numbers). Feasibility is how much of the close already exists here. Risk 1 is a write on the person's own account. Risk 5 is money, a signature, a government submit, or a send that cannot be taken back. A higher score is a better candidate. A live row can score high and still not be a future slice.

**Approval** is Do It (one tap, own account), Suggestion (card, never automatic), Preview (one click before a send), Pause (a password or מאשר stays `proof_pending`), or Hold («מאשר» before any build).

## 1. Catalog

Fifty-eight loop types. Chains at the end are compositions of these rows (58 rows plus 4 chains).

### Email (Gmail and Outlook)

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Dated ask becomes a task | "Please review the Q3 sheet by Friday." | live | Create the task on the surface's list | Gmail: `googleTasksWrite`. Outlook task-only: `outlookTaskWrite`. Title: `core/commitment-title.js` | GET by id. `google/tasks` or `microsoft/todo` | Delete that task | 1 | Do It | 4 | 5 | 5 | 1 | 500 |
| E2 | Your own dated promise | "אחזור אליך ביום חמישי." | live | Same task write | `core/follow-up.js`, `core/request-types.js` `detectCommitmentSentence` | Same as E1 | Delete that task | 1 | Do It | 4 | 5 | 5 | 1 | 500 |
| E3 | Reply to what they asked | "Can you confirm the Thursday slot?" | partial | Draft only. The person sends | `gmailDraftWrite`, `outlookDraftWrite`, `core/draft-reply.js` | None. A draft id is not `fetchedBack` | Delete the draft | 3 | Do It, then Preview when send exists | 3 | 5 | 4 | 3 | 180 |
| E4 | Save the one attachment to OneDrive | "תשמור את הקובץ ב-OneDrive." | live | Write that one file | `core/onedrive-file.js`, `outlookFileWrite`. Gmail that names OneDrive stays quiet | GET the item. `microsoft/onedrive` | Delete, or restore the previous version | 1 | Do It | 4 | 4 | 5 | 1 | 400 |
| E5 | Save the one attachment to Drive | "Save the attached PDF to Drive." | partial | Copy the file into Drive | `core/google-closes.js` save, process `file-it`. Not on the proof gate (`docs/true-close.md` §7) | GET the Drive file by id. Not built | Trash the file Glance created | 2 | Do It | 4 | 3 | 3 | 2 | 144 |
| E6 | Suggest-save, even unasked | A contract PDF arrives with no "please save" | partial | Offer the save. Write only after they accept | `core/suggest-save.js`. UI is the 0.9.41 list. Writer exists and the page does not call it | Same as E4 or E5, after they accept | Same as the save | 1 | Suggestion | 4 | 5 | 3 | 1 | 300 |
| E7 | You are waiting on them | You wrote "any update on the invoice?" | partial | A chase task and a nudge draft. Tracking is not the close | `core/follow-up.js`, `src/follow.js` | The close is their real answer (`core/reply-meaning.js`), not the task | Delete the task. The nudge draft deletes | 2 | Do It | 3 | 4 | 3 | 2 | 144 |
| E8 | A very short chase | "חשבונית?" or "Signed yet?" | partial | Open the loop. Do not invent the file | `core/request-types.js` `detectShortAsk` | Same as the artifact, once it is really sent | — | 2 | Do It | 3 | 4 | 3 | 2 | 144 |
| E9 | Their reply finishes your wait | "Approved" / "שולם" on the loop you opened | partial | Mark that loop done when the reply means it | `core/reply-meaning.js`, `core/follow-up.js` `classifyReplyText` | The reply is the proof. A short "Perfect" stays open (`docs/true-close.md` §3) | Reopen | 2 | None until the words qualify | 4 | 3 | 3 | 2 | 144 |
| E10 | Ask a third person to send it | "תבקש מהנהלת חשבונות שתשלח את החשבונית." | quiet | No card | `core/close-chains.js`, `test/third-party-ask-corpus.cjs` | — | — | 1 | Silence | 2 | 2 | 5 | 1 | 100 |

### Calendar and scheduling

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Hold a meeting at a named clock | "Can we meet Thursday at 16:00?" | partial | One event on the person's calendar. No guests | `googleCalendarWrite`. Process `hold` in `core/actions.js`. A bare Outlook meeting stays quiet | GET the event by id. Not on the proof gate | Delete that event | 2 | Do It | 4 | 5 | 3 | 2 | 240 |
| C2 | Move that meeting | "Let's push Thursday's call to Friday at 11." | partial | Update the one matching event | `googleCalendarChange`, process `move-it` | GET the event shows the new time | Put the old time back | 2 | Do It | 4 | 3 | 3 | 2 | 144 |
| C3 | Cancel that meeting | "Thursday's call is cancelled." | partial | Delete the one matching event | Process `clear-it` | GET shows it gone | Recreate only if Glance stored the old body | 2 | Do It | 4 | 2 | 3 | 2 | 96 |
| C4 | Put one named file on a clock | "Add the quote to my calendar Thursday at 4." | partial | One event whose body links the file. Outlook: `POST /me/events`, attendees `[]` | `outlookCalendarWrite`, `core/outlook-calendar.js`. Entra `Calendars.ReadWrite` is blocked (row 45) | GET the event | Delete that event | 2 | Do It | 3 | 2 | 3 | 2 | 72 |
| C5 | RSVP | "Please confirm you'll attend the Thursday demo." | none | Accept or decline the existing invite | Recognized as `join` in `core/request-types.js`. No calendar response writer | GET the response on the event | Revert the response | 2 | Preview | 3 | 2 | 1 | 2 | 24 |
| C6 | Find a time | "Find us 30 minutes next week." | quiet | No card until one slot is real | `core/close-families.js` treats "find a time" as not a hold | — | — | 1 | Silence | 3 | 3 | 5 | 1 | 225 |
| C7 | Invite the other person | "Send Dana a hold for Thursday at 4." | none | Create the event and invite her only after a preview | Outlook events ship with `attendees: []` on purpose | GET the event, and the invite is a send | Delete the event. A sent invite is Undo unavailable | 4 | Preview | 4 | 3 | 1 | 4 | 24 |

C6 scores high because silence is already correct. It is not a slice.

### Documents and spreadsheets

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 | Answer with one fact from a Sheet or Doc | "What's the renewal amount on the Acme row?" | partial | Put that one cell into a reply draft | `core/fact-reply.js`, family J in `core/close-families.js`, process `reply-fact`. Mail search does not include Sheets or Docs (`docs/true-close.md` §4) | The sent reply contains the value. Not built | Delete the draft | 2 | Do It, then Preview | 4 | 3 | 2 | 2 | 96 |
| D2 | Create from the company template | "We don't have a quote. Use our template and send it." | partial | Create the Doc or Sheet from that template. Never a blank file | Family I, `core/google-closes.js`, `driveDoc` / `driveSheet` | GET the new file id. Not on the proof gate | Trash that file | 2 | Do It | 3 | 2 | 2 | 2 | 48 |
| D3 | Comment on a Doc | "Comment on the contract in the Doc." | quiet | No card. The comment writer is not a close | `core/google-closes.js` treats a Doc comment as silence | — | — | 2 | Silence | 2 | 2 | 1 | 2 | 16 |
| D4 | Add a row to a tracker | "Log the ₪3,850 in the payments sheet." | none | Append one row to the named sheet | No Sheets write in the Google scopes beyond `drive.file` | GET the row | Delete that row | 2 | Do It | 3 | 3 | 1 | 2 | 36 |
| D5 | Make or update slides | "Put the Q3 numbers on three slides." | none | Create the deck from a template, or edit the named one | Object `deck` is recognized. No Slides scope | GET the file | Trash the file Glance created | 2 | Do It | 2 | 2 | 1 | 2 | 16 |
| D6 | A Word file built on the device | A letter the person will attach | partial | `core/docwriter.js` can build a `.docx` blob. It is not a close | Library only. No Do It calls it | The file id after it is saved to Drive or OneDrive | Trash that file | 2 | Do It | 2 | 1 | 2 | 2 | 16 |

### Files

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Send the file they named, if it already exists | "שלח לי את ההסכם החתום." One file in Drive | partial | Attach that one file to a draft. Close only when a message the person sent carries it | `core/close-chains.js`, `core/file-attach.js`, `core/resolution.js`. Outlook can attach to the draft after Graph returns an attachment id | GET the sent message and see that file name. Not built. Two matches stay quiet | Delete the draft. A sent message is Undo unavailable | 3 | Do It, then Preview | 5 | 5 | 3 | 3 | 225 |
| F2 | Find the file on OneDrive | "The passport scan is in my OneDrive." | none | Search the person's OneDrive and attach the one hit | A mail does not search OneDrive (`core/onedrive-file.js`) | GET the item, then the sent message | Delete the draft | 2 | Do It, then Preview | 4 | 3 | 1 | 2 | 48 |
| F3 | Shared library, SharePoint, Dropbox | "Save it to the shared folder." | quiet | No card. The write would land in the wrong place | `core/suggest-save.js` `OTHER_TARGET` | — | — | 1 | Silence | 3 | 2 | 5 | 1 | 150 |
| F4 | Several real attachments | Three PDFs, "save the attachments." | partial | One suggestion for the set, after the list is readable | Suggest-save can name several files. An explicit save with two files stays off | GET each new item | Delete the files this write created | 2 | Suggestion | 3 | 3 | 2 | 2 | 72 |

### Tasks, beyond the email Gates

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | A repeating commitment | "Send the VAT summary on the 15th each month." | partial | One recurring task, or the next occurrence | `core/recurrence.js` exists. It is not a live Gate | GET the task, including the recurrence | Delete that series | 1 | Do It | 3 | 3 | 2 | 1 | 90 |
| T2 | A board item (Monday.com) | "Add this to the board." | none | Create one item | `mondayWrite` is in `src/background.js`. The host permission was removed. Not on the Connect screen | GET the item | Delete the item | 2 | Do It | 2 | 1 | 1 | 2 | 8 |

E1 and E2 are the task closes that are live. T2 is a poor personal fit. It stays off the roadmap.

### Messaging

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Read a 1:1 WhatsApp ask | "תשלח לי את הקובץ" in an open chat | partial | Offer in the panel. Do not type in WhatsApp | `src/content-whatsapp.js`. Read-only, 1:1, stricter than mail. Not verified on the real WhatsApp Web (`docs/multi-platform.md`) | — | — | 3 | Opt-in once | 4 | 4 | 2 | 3 | 96 |
| M2 | Answer in the chat from a connected source | "איפה אכלנו בשבוע שעבר?" | none | Find the place in Calendar or mail. Draft in the chat. They approve | Row 54. No chat composer. `core/close-chains.js` can hold a fact or a date once the host fetched it. Calendar is not searched today | Re-read the outgoing chat line | Delete the chat message if the app allows it. Otherwise Undo unavailable | 3 | Preview | 5 | 4 | 2 | 3 | 120 |
| M3 | The same on Messenger | A friend asks for the same address in Messenger | none | Same as M2 on that site | No content script. `manifest.json` has no Messenger host | Re-read the outgoing line | Same as M2 | 3 | Preview | 4 | 3 | 1 | 3 | 36 |
| M4 | Post into Slack | "Drop this amount in #finance." | none | One message, after a preview | `slackWrite` exists. Status in `core/connectors.js` is building. The API host is not in `host_permissions` | GET the message timestamp | Delete that message | 4 | Preview | 3 | 2 | 1 | 4 | 12 |
| M5 | Read a Teams chat | A colleague asks in Teams for the deck | none | Same read rules as WhatsApp, then M2 | The Teams checkbox asks `Chat.Read`. Entra does not list it (row 44). No page script | Re-read after an approved send | Same as M2 | 2 | Opt-in, then Preview | 3 | 2 | 1 | 2 | 24 |
| M6 | A LinkedIn message | A prospect asks "can you send the one-pager?" | none | Find the file, draft in the thread, they approve | No script, no host | Re-read the sent message | Undo unavailable after send | 3 | Preview | 3 | 2 | 1 | 3 | 18 |
| M7 | Their chat answer closes an email loop | Dana replies on WhatsApp "sent the receipt" and it is the same amount | partial | Close the email loop when the person and the topic match | `core/cross-channel.js`, `core/identity-graph.js`. Tested on a mock page | The chat line plus the matching loop id | Reopen | 2 | At most one "same person?" question | 5 | 3 | 2 | 2 | 120 |

### Money

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Y1 | Send a receipt that already exists | "תשלחי לי את הקבלה על 3,850 ₪." | partial | Find it, attach it, they approve the send. Glance does not issue a receipt | `core/resolution.js` class `receipt`. `docs/resolution-paths.md` | The sent message carries that file. A name with a different amount is dropped | Delete the draft. Sent mail is Undo unavailable | 3 | Preview | 5 | 4 | 3 | 3 | 180 |
| Y2 | Issue a tax invoice | "תוציאי חשבונית מס על הריטיינר." | none | Create it in Morning / Green Invoice, then the person issues | Not built. Row 43. Hold until «מאשר». The chain never writes to an invoicing system | The invoice number read back from Morning, then the sent PDF | Void only if Morning allows it. Otherwise Undo unavailable | 5 | Hold, then Preview | 5 | 3 | 1 | 5 | 15 |
| Y3 | Chase money you are owed | "Following up on invoice 1044, ₪12,000." | partial | A task on the chase day. Not a payment | `core/follow-up.js` action `pay` | Their reply that the money moved, or a bank mail the person opened (amount and day only) | Delete the task | 2 | Do It | 4 | 3 | 3 | 2 | 144 |
| Y4 | A refund | "Please refund the double charge." | none | Do not move money. Track the ask, or open the refund page and stop for them | Lexicon `refund` in `core/request-types.js`. No bank writer | The refund id on the processor page, re-read | Undo unavailable after the processor accepts | 5 | Pause on the pay button | 4 | 2 | 1 | 5 | 8 |
| Y5 | Pay a bill | "החשבון של החשמל מגיע ביום ראשון." | none | A task with the amount and the day. Glance does not pay | Recognized as `pay` / `invoice`. No payment API | The task id only. Paying is a later, separate approve | Delete the task | 5 | Do It for the task. Pause before any payment | 4 | 3 | 1 | 5 | 12 |
| Y6 | Proof a transfer happened | "Send the אישור העברה for the ₪3,850." | partial | Find an existing proof. The bank is the issuer | `core/resolution.js` class `transfer`, source `bank` | The sent file, after they approve | Delete the draft | 3 | Preview | 4 | 2 | 2 | 3 | 48 |
| Y7 | Send a quote or a proposal | "Please send the הצעת מחיר by Thursday." | partial | Find it or say it is missing. Draft. Close when the sent mail has the file | `core/resolution.js` classes `quote`, `proposal` | The sent attachment | Delete the draft | 3 | Preview | 4 | 3 | 3 | 3 | 108 |

### Forms and government sites

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G1 | Submit a government form | A mail says the annual report on gov.il is due | none | Fill known fields. Stop on the submit control | Own-computer driver is not wired (`docs/computer-proof-gate.md`). A password or מאשר pauses | DOM re-read of the confirmation number | Undo unavailable after submit | 5 | Pause | 5 | 2 | 1 | 5 | 10 |
| G2 | A municipal bill | "ארנונה for the Dizengoff flat is open." | none | A task with the amount. Do not pay the city site | None | The task id | Delete the task | 5 | Do It for the task. Pause before pay | 3 | 1 | 1 | 5 | 3 |
| G3 | Send an ID or a certificate they asked for | "תשלח צילום תעודת זהות." | partial | Find the one scan already in Drive. Do not fetch it from a ministry | Family A in `core/close-families.js` names תעודת זהות, דרכון, טופס מס | The sent file | Delete the draft | 3 | Preview | 4 | 2 | 2 | 3 | 48 |

### Travel and bookings

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | A booking mail becomes a hold | El Al confirmation: "TLV–LHR, 12 Nov, 06:40." | partial | One calendar event if the clock is unambiguous | May match process `schedule` in `core/actions.js`. No airline connector | GET the event | Delete the event | 2 | Do It | 3 | 2 | 2 | 2 | 48 |
| R2 | Change or cancel the booking | "Move my Thursday flight to Friday." | none | Drive the airline page. Stop before pay or confirm | Computer driver, one allowlisted host, later | The booking code re-read on the page | The airline's own cancel, if it exists | 4 | Pause | 4 | 1 | 1 | 4 | 8 |
| R3 | Reply with the booking reference | "What's my locator for Thursday?" | none | Draft the code from the confirmation mail. They approve | Same shape as M2, source is mail | The sent line contains that code | Undo unavailable after send | 3 | Preview | 3 | 2 | 1 | 3 | 18 |

### Shopping and returns

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Start a return | "Open a return for the KSP order." | none | Open the order page, fill the reason, stop before submit | No store connector. Computer driver later | The return number re-read | The store's cancel, if the return is still open | 3 | Pause | 3 | 2 | 1 | 3 | 18 |
| S2 | Remember an order | "The Super-Pharm package arrives Thursday." | partial | A task on that day, if the sentence is a commitment or a dated fact | Falls through to `log-it` only when the intent is clear. Otherwise quiet | GET the task | Delete the task | 1 | Do It | 2 | 3 | 2 | 1 | 60 |

### CRM and contacts

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Log a note on the sender | "Note on Dana: she asked for the signed הסכם." | none | One note on the matching contact | `hubspotWrite` / `salesforceWrite` exist. Not in `host_permissions`. Not on the MVP Connect screen (`core/connectors.js`) | GET the note id | Delete the note | 2 | Do It | 2 | 2 | 1 | 2 | 16 |
| P2 | Update a contact | "Dana's new mobile is 052-…" | none | Write that field on the Google or Microsoft contact | Contacts checkboxes are read-only. Microsoft `Contacts.Read` is blocked (row 44) | GET the contact | Restore the previous value | 2 | Do It | 3 | 2 | 1 | 2 | 24 |
| P3 | Remember this page | Right-click "Stay on this" on a tab | partial | Open a loop. That is the start, not the close | `core/capture.js` | Whatever close the loop later earns | Dismiss the loop | 1 | Do It | 3 | 2 | 3 | 1 | 90 |
| P4 | One person, two apps | The Dana on mail and the Dana on WhatsApp | partial | Merge only on a hard key. A shared name asks once | `core/identity-graph.js` | The merge record. It does not close a loop by itself | A "no" is remembered | 2 | One question | 4 | 3 | 3 | 2 | 144 |

### On the person's computer

| ID | Loop | Example | Now | Closing action | Path | ProofOfClose | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| U1 | Finish an allowlisted page | A fixture page with a Mark done control | partial | Drive that control, then re-read the page | `core/proof-of-close.js` `computer/example.com`. Row 48. The live driver is not wired. Corpus injects the reader | DOM re-read: URL matches and the success selector is present | Inverse action, or "Undo unavailable" | 2 | Do It. Pause on a password or מאשר | 3 | 2 | 2 | 2 | 48 |
| U2 | A file on the local disk | The signed PDF is in Downloads, not in Drive | none | Read it, then the mail or chat close uses those bytes | `computer/local/<app>` is a later gate and is not a proof. `core/docreader.js` can read a `.docx` | The file hash or the saved cloud id, after a read-back | Trash the cloud copy Glance wrote | 2 | Do It | 4 | 3 | 1 | 2 | 48 |
| U3 | Sign a PDF | "Please sign and return the הסכם." | none | Open the file for the person to sign. Glance does not sign | No signature writer. `core/resolution.js` class `signed-copy` says the owner move is "Sign it" | The sent message carries the signed file | Delete the draft before send | 5 | The person signs. Preview on the send | 5 | 3 | 1 | 5 | 15 |

### Cross-surface chains

These are the asks a single Gate cannot finish. Each step keeps its own proof. The loop closes on the last real completion, not on the first draft.

| ID | Chain | Example | Now | Steps | Proof of the chain | Undo | Risk | Approval | V | Fq | Fe | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| X1 | Signed contract | Mail: "Please send the signed הסכם." | partial | Find the PDF (F1). If it is unsigned, the person signs (U3). Reply with the file (E3 + Preview). A Friday check on the calendar (C1) | The sent message has the file. The calendar event is a separate proof, not the close | Draft and event can undo. The sent mail cannot | 4 | Preview on the send. The person signs | 5 | 3 | 2 | 4 | 60 |
| X2 | Restaurant in the chat | WhatsApp: "איפה אכלנו בשבוע שעבר?" | none | Read the chat (M1). Find Thursday's event or the reservation mail (C1, E9). Draft in the chat (M2). They approve | Re-read the outgoing line. No hit means silence | Delete the chat line if the app allows | 3 | Preview | 5 | 4 | 2 | 3 | 120 |
| X3 | File, then the work continues | A contract PDF arrives, and the body says "let's review it Friday at 10." | partial | Suggest-save (E6). After they accept, prove the file (E4 or E5). Hold Friday (C1). A reply is a draft until they approve | File id and event id. The reply closes only if they send it | Delete the file and the event | 2 | Suggestion, then Do It, then Preview | 4 | 3 | 2 | 2 | 96 |
| X4 | Invoice, mail it, chase if unpaid | "תוציאי חשבונית מס ותשלחי לדנה." | none | Issue in Morning (Y2, Hold). Attach the PDF. They approve the send. A task if it stays unpaid (Y3) | Morning number, then the sent PDF | Void only if Morning allows. The task deletes | 5 | Hold until «מאשר» | 5 | 3 | 1 | 5 | 15 |

## 2. What the scores say

Sorted by score, excluding rows that are already live (E1, E2, E4) and rows whose high score is "stay quiet" (C6, F3, E10):

| Rank | ID | Score | Why it is not automatically next |
|---|---|---|---|
| 1 | E6 Suggest-save | 300 | This is the 0.9.41 steps list, not a slice after it |
| 2 | C1 Hold a meeting | 240 | Writers exist. Proof does not. Guests stay off |
| 3 | F1 Send a file that exists | 225 | The done-definition is already written. The send and the proof are not |
| 4 | Y1 Existing receipt | 180 | A special case of F1, with a payment check |
| 5 | E3 Reply draft | 180 | A draft is not the close. The missing piece is Preview |
| 6 | P4 Identity | 144 | Enables M7. It does not itself finish an ask |
| 7 | Y3, E7, E5, C2, E8, E9 | 144 | Useful, and narrower than a chain |
| 8 | M2 / X2 Chat answer | 120 | Lower feasibility. The owner already named it as the next scenario |
| 9 | M7 Cross-app close | 120 | Their words close your loop. Glance still must not send |
| 10 | Y7 Quote or proposal | 108 | Same shape as F1 |
| 11 | X3 Save plus Friday hold | 96 | Uses E6 and C1. A good scenario, a weak standalone slice |
| 12 | X1 Signed contract | 60 | The shape the owner described. Blocked on the computer driver and on risk |
| 13 | Y2 / X4 Issue an invoice | 15 | Hold until «מאשר» |

## 3. The next three slices after 0.9.41

0.9.41 is the steps list (row 52): Suggested and Added, Gmail and Outlook, suggest-save visible. `Mail.Send` (row 53) is not one of these slices. It is the preview those slices use when a step sends. It stays where the owner put it: on that list, after the list is live, before a new site sends anything. Until it exists, the code does not ask `Mail.Send`.

The chat scenario scores 120, under the meeting (240) and the file (225). It is still slice 1. The owner locked it as the next scenario after the send preview (row 54). A ranking that buried it would keep Glance inside the inbox the owner already called too narrow.

### Slice 1 — Answer in the place they asked

**Score 120, promoted by the lock.** Cross-surface: WhatsApp Web (then the same pattern on Messenger) plus Calendar or mail.

**Done when** the outgoing chat line is the answer, and a re-read of that line sets `fetchedBack`.

**Steps.** Detect the ask in the open 1:1 chat, or stay quiet. Search sources already connected: the person's calendar, then mail they have opened. One hit becomes a draft in the chat. Zero hits, or two hits, stay quiet. The person reads the draft and approves. Glance sends on that click only.

**Gate.** WhatsApp Web, a 1:1 chat. The friend writes "איפה אכלנו בשבוע שעבר?". The calendar has one event that week whose title is a place, for example "פורט סעיד". The card shows that place and the draft. They approve. The chat shows the sent line. Reload the chat: the receipt is still there. Activity stores the chat message id with `fetchedBack`. A second chat with two restaurants that week shows no card. Undo deletes the message if WhatsApp allows it; if it does not, the line says Undo unavailable and Activity is not HANDLED.

### Slice 2 — Put the meeting on the calendar, then confirm

**Score 240.** Cross-surface: mail or chat, plus Calendar, plus an approved reply.

**Done when** the event is read back by id, and, if they also wanted the other person told, the sent confirmation is read back too. The event alone closes the hold. The confirmation closes the reply. A hold with no guests is a finished hold. Inviting someone is a separate preview.

**Steps.** One named clock. Create the event with no attendees. GET it. Show Handled for the hold. If the sentence also asks to tell them, the steps list shows a confirmation draft. They approve. The send is a second proof.

**Gate.** Gmail or Outlook. The mail says "Can we meet Thursday at 16:00 about the quote, and reply to confirm?". Do It creates the event. A GET returns that id. The receipt says Handled for the hold. The confirmation sits on the steps list as a preview. They click approve. The sent message is read back and names Thursday 16:00. Reload: both proofs remount. Undo deletes the event. The sent mail says Undo unavailable. A mail that says "find a time" shows nothing. An Outlook token without `Calendars.ReadWrite` says reconnect and does not say Handled.

### Slice 3 — Hand them the file that already exists

**Score 225.** Cross-surface: mail, Drive (and this thread), and the send.

**Done when** a message the person sent carries the one file the chain found. The draft is not the close. `docs/resolution-paths.md` already defines this. The slice adds the approved send and the read-back.

**Steps.** Derive the file (receipt, contract, quote, proposal, signed copy). Search Drive and this thread. One hit: attach it and show the preview. They approve. Read the sent message back and require that file name. No hit: say where Glance looked, and offer a holding reply that is labelled as a promise, not a close. Two hits: silence.

**Gate.** Outlook or Gmail, Hebrew. "תשלחי לי את הקבלה על 3,850 ₪." Drive has one file whose name fits, and no file whose name is a different amount. Do It shows the file and the preview. They approve. Graph or Gmail returns the sent message with that attachment. The receipt says Handled only then. Reload remounts it. A second file with the same kind of name shows no card. "Can you ask accounting to send the receipt?" shows no card. Undo before approve deletes the draft. After approve, Undo is unavailable.

The full sign-and-return chain (X1) is the right later slice, after U1's driver is wired and U2 can read a local PDF. It does not jump this list. Y2 stays on hold.

## 4. Scenario Gates

Today's Gates check one write. A scenario Gate is one sitting: several loops, on the surfaces a person actually moves across, each with its own proof. The day below is one person. Five scenarios. Any step that cannot prove itself does not say Handled.

### Scenario A — Thursday morning, the writes that already exist

Before any new slice. Proves the steps list and the three live proofs in one session.

1. Outlook: "I'll send Dana the numbers by Thursday." Do It writes Microsoft To Do. GET the task. Handled. Reload the thread. The banner returns.
2. The next mail has a PDF and does not ask to save it. The suggestion card offers OneDrive. They accept. GET the file. Handled.
3. A third mail asks for a reply. The draft appears on the list as Added. It does not say Handled.
4. Undo the task. Undo the file. Activity drops both HANDLED lines. The draft Undo deletes the draft.

Pass bar: three cards, two Handled proofs, one draft that stays a draft, both Undos clean. Nothing is sent.

0.9.41 draws this sitting. The headless mirror is `flow-trial-extension/e2e/scenario-a.spec.js` (mocked Graph). A typed step is the Added tag; a planned reply stays a draft row and the receipt says Draft ready. The live Gate is not run.

### Scenario B — The receipt leaves

Slice 3, end to end. The Hebrew receipt mail in that slice's Gate, plus the payment check from `core/resolution.js`: if no file exists and nothing confirms the ₪3,850, the card asks whether it was paid and does not draft a receipt. Glance does not issue one.

### Scenario C — The restaurant, in the chat

Slice 1, end to end. The WhatsApp Gate in that slice. Same afternoon, Messenger stays quiet because that host is not on. The point of the scenario is the approved send in the chat, with a re-read, and silence when two places match.

### Scenario D — The meeting they named

Slice 2, end to end. The Thursday 16:00 Gate. Add one cross-check: a WhatsApp line the same morning, "Thursday at 4 still good?", does not create a second event. M7 may attach it to the event that already exists. Two clocks and no single slot stay quiet.

### Scenario E — The contract, and the invoice that waits

The mail asks for the signed הסכם. Drive has the unsigned PDF. The steps list shows: found, needs a signature, reply preview, Friday follow-up. The person signs on their machine. Glance does not sign. They approve the reply. The close is the sent attachment. The Friday event has its own GET. In the same sitting, "תוציאי חשבונית מס" does not open Morning and does not say Handled. That row stays on hold until «מאשר».

Pass bar for E: the contract closes only on the sent file; the invoice produces no write.

## 5. What blocks breadth, and what to do first

| Block | What is true on this tip | What to do first |
|---|---|---|
| Consent is narrower than the lock | Google scopes in `manifest.json` are Tasks, `calendar.events`, `gmail.compose`, `drive.readonly`, `drive.file`. No Gmail search of other threads, no Sheets, Docs, Slides, or Contacts scopes. Microsoft Connect can ask Calendar, OneDrive, Contacts, Teams, and To Do. The Entra app is missing delegated permissions those boxes need (rows 44 and 45). Default sign-in is mail read and draft write | Add the delegated permissions the checkboxes already request, on the Entra app, before any new Microsoft Gate. Add a Google scope only in the same commit as the privacy page and the store text |
| The store build | Unpacked manifest is 0.9.41 (steps list, `Save the file?`, the display fixes). New hosts are optional today: WhatsApp Web, Graph, the three Outlook hosts, localhost. A send scope or a new site is a store review and a privacy-page change together. The live scenario A Gate is not run | Run the live scenario A Gate before a store upload. Do not add hosts for the catalog "none" rows in that upload |
| `Mail.Send` | Approved as a preview and one click. Not built. The identity block still says Glance never sends, until the owner changes that wording in `docs/product-identity.md` | Build it as the preview on the steps list (row 53). Change the locked wording in the same commit. No other send path |
| The computer driver | Row 48 is a scaffold. The live page driver is not wired. Local files are a later gate | Wire the one allowlisted page and run that Gate before any local PDF or government page |
| Model quality | v2 with the veto still misses about half of closes on machine labels, and wrong-Do-It is about 1.4% on that set (`docs/glance-ai/STATE.md`). Owner-verified labels are 0 of 200. Gated Qwen is offline and propose-only. A wrong send is worse than a miss | Keep silence when the on-device rules are unsure. Do not let a model close or send. Collect the 200 owner labels before a new close type depends on a model |

**Priority.** The breadth slices (1–3) and Dima's queue (as ordered in `docs/glance-ai/CTO_PATH_TO_PAID_2026-10-08.md`) run in parallel. Each PR gets a live scenario Gate and is then squash-merged. The one constraint is that no stream touches a file that an open Dima PR is changing at the same time.

Order of work, from this map. This list does not hold slices 1–3 until Dima's queue is finished:

1. Finish the steps list and run scenario A on the proofs that already pass.
2. One Dima PR: add `fetchedBack` read-back for both Google Calendar create (C1) and the Drive file GET.
3. `Mail.Send` as that list's preview, with the identity wording.
4. Slice 1, the chat answer, on top of that preview.
5. Slice 2, the meeting with a proved event and a proved confirmation.
6. Slice 3, the file they asked for, closed on the sent attachment.
7. The computer driver (row 48), then the signed-contract chain.
8. Morning only after «מאשר».

## What this file does not do

It does not move rows 51–54. It does not turn on a model, a send scope, or Morning. It does not describe Flow.
