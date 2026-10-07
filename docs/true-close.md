# True close: a loop closes when it was answered, not when somebody wrote back

> Written 2026-10-04. Code: `core/follow-up.js` (`classifyReplyText`), `core/resolution.js` (document classes), `src/follow.js`. Tests: `test/true-close-corpus.cjs` (new),
> `test/resolution-corpus.cjs`, `test/follow-gmail-harness.cjs` section 32j. Companions: `docs/reply-model.md`, `docs/resolution-paths.md`, `docs/open-loops.md`.

## 1. The definition the product uses

A loop is **closed** when the original intention was actually completed (the answer arrived, the file was really sent, the person marked it done), or was **released on purpose** by the person.
These are not closes: "got it", an out-of-office, "I'll get back to you", "it is with accounting", a draft that was prepared and not sent, a file that was named and not attached.

## 2. What was found

The reader had one weak place: when no rule fired and the on-device reply model was not sure, a reply was **closed by default**, on the old assumption "they wrote back, so it is answered". I wrote a fresh list
of 71 replies that look like an answer and are not (English and Hebrew: received/seen, "I'll get back to you", out of office, in progress, waiting on someone else, unsure) and 29 that really are one,
and ran the engine as it was:

| | before | after |
|---|---|---|
| replies that only look like an answer and **closed a loop** | **21 of 71** | **0 of 71** |
| real answers that stopped closing (recall lost) | 0 of 29 | 0 of 29 |

What the 21 were: very short unplaceable replies ("Perfect", "Seen", "Maybe", "I think so", "ראיתי", "אולי", "בדרך", "נראה"); "waiting for the CFO to approve" (it names the act, so it read as a delivery); Hebrew promises with no
day ("אעדכן", "בטיפול", "מטפל בזה"); and, a real defect, **Hebrew "yes" inside other words**: the Hebrew confirmation list had no word boundary, so `כן` matched the end of "אעדכן" ("I will update") and made it a delivery.
All the existing corpora, including the model's own precision gates, are unchanged and pass.

## 3. What changed (precision first, nothing lowered)

1. **Waiting on someone else is an interim.** "Waiting for…", "pending approval", "it is with…", "בטיפול", "ממתין ל…": a hold, unless the message also hands something over (attached, here is, sent it).
2. **Promises with no day move the chase, never close**: "will revert", "will update you", Hebrew אעדכן / אחזור / אבדוק / אטפל, and their plural forms.
3. **A very short reply with no answer in it is held open**, silently, with the reason in "What Glance learned": three words or fewer, and nothing that answers (no yes or no, no date, no amount, no number,
   no link, no "done / sent / signed / שלחתי / בוצע"). The cost is stated: a legitimate one-word answer that carries none of those (a bare name in answer to "who?") also waits for the next chase day. That is the side of
   the trade the owner chose: a wrong close is never reminded about again, a held loop is.

The Hebrew boundary fix is the same kind of change: it only stops a match inside a word.

4. **A signature is not an answer, and a quoted ask is not a new one.** A short reply that is only a contact line ("Phone:" / "טלפון:", a title, a name) holds the loop. A forward often leaves nothing else once the quoted history is cut, and closing on that signature was the default. The Hebrew forward banner "הודעה שהועברה" is now the same cut as "Forwarded message", so the quoted text is not judged as the new message. Found on the real-mail gold set (`docs/human-eval.md` §7). The hold list in the corpus gained that signature line and one English contact line of the same shape. The 71/29 measurement above is the earlier experiment.

## 4. The other half: a draft is not a delivery (multi-step documents)

`docs/resolution-paths.md` built the path for receipts. It is now data-driven for **documents the person sends**: contract, quote, proposal, signed copy (`CLASSES` in `core/resolution.js`, one line each).
Same six steps, with no payment step (nothing here attests a payment): find what exists (a file in the thread that THEY did not send, or exactly one file in Drive; never a guess between two), prepare a draft with it,
and close **only** when a message the person sent carries a real attachment named for it. With nothing to send and no template the card says, in one tap, "I will send it" and opens the loop, so the request is not lost
and not marked done; the Do It chip no longer says "Handled." over an unsent draft for these asks. Never sends, issues or signs anything.

The same rule, for every other requirement, is one function (`core/close-chains.js`): derive what would close the loop (a file, a fact, a date, an approval, or an answer), search the connected sources the host already fetched, prepare a draft when exactly one of them holds it, and when every connected source was checked and none holds it, say what is missing and where it looked. One tap can draft a holding reply ("I'll send it by Thursday.") and open a promise. That tap is labelled as a holding reply, not as the close. A template is not a file that was found. A draft, a holding reply, and a calendar event nobody has accepted are not closes. Glance does not issue an invoice.

An ask that gets someone else to act is not a file prepare. English: "ask X to", "have X send", "get X to send". Hebrew: "תבקש מ-X", "תגיד ל-X", "ש-X ישלח". One Drive hit does not attach that file, and Glance does not draft "I'll send it" for that sentence. The outcome is silence. "Send me the invoice" and "שלח לי את החשבונית" still prepare. "שתשלח" ("that you send") stays a direct ask.

Gmail and Outlook pass the same Drive and thread evidence into that function. Calendar, Sheets and Docs are not searched on either surface. The Outlook draft cannot carry a Drive file, so a file that was found stays quiet there instead of a draft that says it is attached. A missing file can still draft a holding reply. Nothing is sent.

Not built (needs connectors that do not exist): asking a colleague who holds the document, e-signature, a CRM, and writing an unissued invoice draft into an invoicing system (Green Invoice / iCount). That last one is approved for the roadmap only (`docs/open-tasks.md` row 43), not now.

## 5. Before and after, as the person feels it

| Moment | Before | After |
|---|---|---|
| Dana answers "Perfect" to your question | the loop closes; you are never reminded | the loop stays; the next chase day asks you, with a line in the Activity list: "too short to be an answer" |
| A colleague writes "waiting for the CFO to approve" | closed as answered | held, silent: "it is with someone else" |
| Hebrew "אעדכן" (I will update you) | closed | the chase moves out; the loop stays |
| Someone asks you for the signed contract and a file is in Drive | the Do It chip drafts it and says "Handled." | one card: "Found X. Draft ready; it is not sent. Done when: a contract sent to Dana, as a real attachment." The loop closes when you send it with the file |
| The same, no file anywhere | the chip may offer a blank template | "Write or sign it, send it, and I will close this when it goes out with the file." One tap keeps it open |
| Someone asks for the invoice and it is not in Drive or this thread | a template card, which is not the invoice | "I could not find the invoice. I looked in Google Drive and this thread." One tap, labelled as a holding reply, drafts "I'll send it by …" and opens a promise. Nothing is sent. The loop closes when you send a message with the file |
| "Can you ask accounting to send me the invoice?" and the file is in Drive | a draft that attaches the invoice | silence. The file is not prepared. "Please send me the invoice" still prepares a draft and does not close |

## 6. Known limits

- The 71 / 29 lists are mine, written for this change; they are not a sample of real mail. The first sentence a real inbox sends that none of these covers will close or hold wrongly; that is what the Activity list
  and the real-mail check in `docs/open-tasks.md` are for.
- The three-word rule is a number picked by hand (`SHORT_UNSURE_MAX_WORDS`), not fitted.
- Hebrew coverage is by word list; the reply model is trained on short sentences and is unchanged.
- The document path has been run through the browser harness (found, none, claimed-but-not-attached, delivered), never on real Gmail.

## 7. Close-fabric wedge: a task is Handled only after a read-back

A prepared draft, an attached file on a draft, and a calendar hold are not this close. This slice is the `fetchedBack` proof for Google Tasks, for Microsoft To Do, and for one OneDrive file.

`core/proof-of-close.js` builds `{ system, externalId, url?, number?, fetchedBack: true, verifiedAt }`. After a Google Task is created, that task is read back by id. The receipt says Handled (or טופל) only when `proof.fetchedBack === true`. Activity stores `system: "google/tasks"`, `externalId`, and `verifiedAt`. Undo deletes that task by `externalId`.

The same contract is a Microsoft To Do task. A task-only Do It on Outlook posts to the default list (`/me/todo/lists/{listId}/tasks`), then reads that task by id. Handled only when `proof.fetchedBack === true`. Activity stores `system: "microsoft/todo"`, `externalId`, and `verifiedAt`. Undo deletes that task by `externalId`. A reply that still has a draft stays a draft. The To Do checkbox asks `Tasks.ReadWrite`. Mail-only sign-in does not. The Entra app must list that delegated permission, and a person who connected before it was asked signs in again with that box checked. Nothing is sent.

The same contract is one OneDrive file. A save of the one attached file writes that file (`PUT` content), then reads the item by id. Handled only when `proof.fetchedBack === true`. Activity stores `system: "microsoft/onedrive"`, `externalId`, and `verifiedAt`. Undo deletes a file this write created. A file that was already there is replaced only when a previous version can be restored, and Undo restores that version. The OneDrive checkbox asks `Files.ReadWrite` only when it is checked. Mail-only sign-in does not. A mail does not search OneDrive. The Entra app must list that delegated permission. Nothing is sent.

The task title, for Google Tasks and for To Do, is the verb and object of the sentence that fired the intent. The date stays on the due field. The sender and the thread link stay in the notes. A sentence with no clean span keeps the chip label. The subject is not the title.

If the create has no id, the result is `proof_pending`. If the read-back misses, returns another id, or shows the task deleted, the result is `verify_failed`. Neither is Handled, and neither is a trusted close. Calendar, Google Drive, and drafts are not on this gate. Nothing is sent.

The on-thread receipt is that Activity row. After Gmail rebuilds the thread (a reload, or inbox and back), the Handled banner is mounted again when `fetchedBack` is true, or when the row still has `system`, `externalId`, and `verifiedAt` from a proved write. The match is the legacy message id and the thread id. A hash of the message text is not enough: Gmail rewrites the clock line in that text on reload. After Outlook rebuilds the thread, the match is the item id, the path id, or the conversation id. A newer undo or dismiss does not put the banner back. Undo rewrites the Activity row, so it does not stay Handled after the task is gone.

## 8. Own-computer wedge: one allowlisted page, read back from the page

Glance closes open loops. Gmail is where it starts today. The floating extension follows the person. This close is a page that extension already sees. It does not replace the extension, and it is not a new site.

**Current implementation status (0.9.32).** Scaffold only. One allowlisted web UI: `system: "computer/example.com"`, path `/fixture/glance-close`, action `mark-done`. `fetchedBack` is a DOM re-read: the URL matches, and the success selector is present. A visible id is `externalId` when the page has one; otherwise `host:path:actionDigest`, stored on Activity. Handled (or טופל) only when `proof.fetchedBack === true`. A click is not that read. A screenshot hash may be kept as audit and is not the gate. A password field or מאשר pauses as `proof_pending`. Escalation is CoS. This path does not ask Sali.

Undo prefers the inverse page action (`mark-open`) when a re-read shows that inverse. If there is no inverse, the line is Undo unavailable. Either way the Activity row is rewritten and does not stay Handled. A reload mounts the banner again from the message id or the thread id.

The live page driver is not wired. Corpus tests inject the DOM reader (`test/computer-proof-corpus.cjs`). The CoS checklist is `docs/computer-proof-gate.md`. `computer/local/<app>` is a later gate and is not a proof in this tip. Google Tasks and Microsoft To Do are unchanged. Nothing is sent.
