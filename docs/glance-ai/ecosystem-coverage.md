# Ecosystem coverage: Google, Microsoft, Meta

Glance closes open loops. Gmail is where it starts today.

This page answers one question for the early-adopter release (owner, 2026-10-20): for every tool in the three ecosystems, what can Glance do today, is it read back and undoable, has anyone run it live, and what is missing. It is status, not the product definition. The locks are in `docs/vault/product-locks.md`: every integrated product is on by default with one consent per ecosystem, the Do It card pops up on its own, native embeds on every device are part of done, a close needs ProofOfClose and Undo, nothing sends on its own, and anything Glance made stays editable.

Source for each line: the code named, `docs/open-tasks.md` rows, and `docs/vault/decisions.md`. Nothing here was run live by the author of this page. "Live Gate" means a person ran it in the real app and the result is recorded; "not run" means no record.

Reading the columns: **Built** is code with corpus tests. **Proof** is a read-back by id (`fetchedBack: true`) plus Undo. **Live Gate** is the recorded real-app check. **Gap** is what stops it being done.

## Google

Scopes today (`manifest.json`, `docs/google-lane.md`): `openid`, `email`, `profile`, `drive.file`, `calendar.events`, `tasks`, `gmail.compose`, `drive.readonly`. No contacts scope. Gmail send is never asked.

| Tool | Built | Proof | Live Gate | Gap |
|---|---|---|---|---|
| Gmail | Reads the open mail, offers one card, reply draft (compose fill or drafts API), no send. `src/content-gmail.js`, `core/incoming-judge.js` | Draft read back by id, Undo deletes it | Many live rounds on #165 and #163, fixes recorded; no recorded PASS on 0.9.56 | The card sits at the end of the mail: a peek card now pins it into view (Gmail only). Reply drafts carry no In-Reply-To (needs a scope). Intent misses are found on real mail (lead asking for a time: fixed 2026-10-20) |
| Gmail add-on (Workspace card) | Task, calendar hold, schedule; Hebrew and English. `glance-gmail-addon/` | Read back, Undo only if unchanged | Test deployment only (up to 100 test users); not seen on iOS or Android | Cannot open itself on its own; uses a prefetch card. Quiet cases show "Nothing to close" until its bundled engine is rebuilt from `core/` |
| Google Calendar | Hold and event; one named clock held with a read-back (PR #152, open) | Event read back, Undo checks the content hash | #165 live rounds | Responding to an invite ("please confirm you'll attend") is PR #174 (draft). No Meet link on a hold |
| Google Tasks | Task with a due date, one list titled Glance | Read back, Undo only if title, due and etag are unchanged | Gate PASS 0.9.30 | Recurring reminders and watchers are queued, not built |
| Google Drive | Find a file (`drive.readonly`), save an attachment (`drive.file`) | `md5Checksum` read back, Undo trashes what this lane made | #165 live round | Large and inline files; a file Glance did not create is never edited |
| Google Docs | Create or append on a file Glance made (`core/google-docs.js`) | Read back | Not run | A request with no attachment ("write a one-page summary") is PR row 76 (8a/8b), not built |
| Google Sheets | One row on a Glance-made sheet (`core/google-sheets.js`) | Read back | Not run | Same as Docs: create-from-request not built |
| Google Contacts | Name lookup written, no scope granted | n/a | Not run | Needs the `contacts` scope and its OAuth review |
| Google Meet, Slides, Forms, Keep | Not built | n/a | n/a | Not started. Meet link on a hold is the first one worth doing |

## Microsoft

Entra app `22682454-808b-41e5-80fe-6abadc1d5595`. Scopes in code (`core/outlook-config.js`): mail sign-in asks `Mail.Read` and `Mail.ReadWrite`; each other scope is asked only when its Connect box is ticked (`Tasks.ReadWrite`, `Calendars.ReadWrite`, `Files.ReadWrite`; `Contacts.Read` and `Chat.Read` belong to the contacts and Teams lanes). `Mail.Send` is never requested; the preview sits behind `MAIL_SEND_ENABLED` false. The owner must confirm that every one of these is listed on the Entra app (rows 44, 45 of `open-tasks.md` still read "blocked").

| Tool | Built | Proof | Live Gate | Gap |
|---|---|---|---|---|
| Outlook mail (web) | Same judge as Gmail, reply draft through Graph, never send. `src/content-outlook.js` | Draft read back, Undo deletes it | PASS through 0.9.39 (rows 47, 49, 50) | The peek card is Gmail only. 0.9.56 changes not re-run live |
| Outlook Calendar | Hold with `POST /me/events` | Read back, Undo deletes | Not run on 0.9.56 | Entra scope confirmation (row 45) |
| Microsoft To Do | Task on the default list | Read back, Undo deletes | PASS 0.9.31 | none known |
| OneDrive | Save an attachment to `OneDrive > Glance > file` | Read back, Undo deletes or restores | PASS 0.9.37 | Accounts that connected before the box was ticked have no `Files.ReadWrite` and the Save card stays quiet until ticked once (row 75) |
| Word / Excel | One Word file or one Excel row with read-back (`core/outlook-word.js`, `core/outlook-excel.js`) | Read back | Not run | A request with no attachment, and a real table write, are row 76 |
| Teams | Reads chats you are in (`Chat.Read`), shows a draft, never posts (`core/teams-chat.js`) | n/a, a draft is not a close | Not run | No post, by design. Meeting and channel signals not read |
| Outlook Contacts | Name to address (`core/outlook-contacts.js`) | n/a | Not run | Split or unclear matches stay quiet |
| SharePoint, OneNote, Planner, PowerPoint | Not built | n/a | n/a | Not started. SharePoint is the first one an organisation will ask for |

## Meta

One consent turns on Messenger, Facebook messages, Business Suite, Instagram and WhatsApp Web together (`lane-chat/enable.html`, `lane-chat/meta-consent.js`, the Meta row in the panel). Everything runs in the page; there is no Meta app, no Graph token and no store review for Meta. A draft is inserted into the page's own composer and never sent.

| Tool | Built | Proof | Live Gate | Gap |
|---|---|---|---|---|
| WhatsApp Web | Follow-up loop (read only) and reply drafts; experimental, 1:1 only. `src/content-whatsapp.js`, `src/content-whatsapp-draft.js` | The loop closes only when the answer is read; a draft is not a close | Not run on the real site | Owner accepted the policy risk (row 17); a real try on the live site is open |
| Messenger / Facebook messages | Draft in the open chat (`src/content-messenger.js`) | n/a | Not run | Identity rules for e2ee threads and Hebrew-to-Latin names (row 71) |
| Instagram | Draft in the open DM (`src/content-instagram.js`) | n/a | Not run | Same identity gaps; Instagram markup changes without notice |
| Meta Business Suite | Named in the same consent (`lane-chat/meta-consent.js`) | n/a | Not run | No separate parser or test of its own was found |
| WhatsApp Business Cloud API | Plan only (`docs/glance-ai/whatsapp-business-cloud-plan.md`) | n/a | n/a | Needs the owner's Meta business verification. The only route that gives a read-back |
| Facebook Pages and posts, Threads | Not built | n/a | n/a | Not started |

## What this means for the friends release

- **Closest to done:** Outlook mail, To Do and OneDrive (live Gates passed on earlier packages), then Gmail with Tasks, Calendar and Drive (built and heavily tested, no recorded PASS on 0.9.56).
- **Built but never seen live:** Docs, Sheets, Word, Excel, Teams drafts, Contacts, and every Meta surface.
- **Not started:** Meet, Slides, Forms, Keep, SharePoint, OneNote, Planner, PowerPoint, Facebook Pages, Threads, WhatsApp Business.
- **The learning loop:** the on-device threshold and Execution Memory learn from each person's clicks. The export of own-use decisions for training the model (`docs/glance-ai/learning-from-use.md`, paths A to D) is not built in the extension, so "the system learns from everyone's use" is true per person and not yet across people.
- **The release gate:** a package must pass the regression corpora first. On 2026-10-20 nine corpora are red on the working branch tip; three of them pass when the clock is set back to 2026-10-16, so they are date-bound fixtures, and the other six are open (`docs/open-tasks.md`).
