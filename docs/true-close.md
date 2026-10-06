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

Not built (needs connectors that do not exist): asking a colleague who holds the document, e-signature, a CRM. An invoice, a tax invoice and a statement keep the old chip until the receipt and document paths have been used on real mail.

## 5. Before and after, as the person feels it

| Moment | Before | After |
|---|---|---|
| Dana answers "Perfect" to your question | the loop closes; you are never reminded | the loop stays; the next chase day asks you, with a line in the Activity list: "too short to be an answer" |
| A colleague writes "waiting for the CFO to approve" | closed as answered | held, silent: "it is with someone else" |
| Hebrew "אעדכן" (I will update you) | closed | the chase moves out; the loop stays |
| Someone asks you for the signed contract and a file is in Drive | the Do It chip drafts it and says "Handled." | one card: "Found X. Draft ready; it is not sent. Done when: a contract sent to Dana, as a real attachment." The loop closes when you send it with the file |
| The same, no file anywhere | the chip may offer a blank template | "Write or sign it, send it, and I will close this when it goes out with the file." One tap keeps it open |

## 6. Known limits

- The 71 / 29 lists are mine, written for this change; they are not a sample of real mail. The first sentence a real inbox sends that none of these covers will close or hold wrongly; that is what the Activity list
  and the real-mail check in `docs/open-tasks.md` are for.
- The three-word rule is a number picked by hand (`SHORT_UNSURE_MAX_WORDS`), not fitted.
- Hebrew coverage is by word list; the reply model is trained on short sentences and is unchanged.
- The document path has been run through the browser harness (found, none, claimed-but-not-attached, delivered), never on real Gmail.
