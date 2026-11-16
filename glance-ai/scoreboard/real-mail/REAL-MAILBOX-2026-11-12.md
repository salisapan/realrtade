# The first run on the owner's real mailbox, 2026-11-12

Glance closes open loops. Gmail is where it starts today.

The owner asked for a check on a realistic state: the mailbox this session is connected to, read with his say on 2026-11-12. Eval only. The rows are masked (names, addresses, phones, links, codes and figures replaced) and live in `private/` (gitignored, never committed, never a training row). This page holds aggregates only, no mail text. Gold: one pass by Claude in session, written before the engine ran, NOT owner-verified. No API spend.

Run: `node glance-ai/scoreboard/real-mail/run-owner-mailbox.cjs` (prints nothing where the private file is absent).

## 1. What the mailbox really holds (about 80 recent threads)

| kind | mails | carry something to close |
|---|---|---|
| automated and system mail (security alerts, codes, trials, newsletters, calendar notices, a bounce) | 35 | 0 |
| auto-replies from people (out of office) | 3 | 0 |
| mail written by real third parties | 8 | 2 (plus 1 with no convention: a one-word opt-out) |
| test mails the owner typed for live Gates | 30 | 17 (reported apart: the engine was tuned on such tests) |

Limits: one mailbox, a business and test mailbox; 76 rows; automated mail is judged on Gmail's preview (about 200 characters) except three read in full; the clock is the lab's frozen clock. Two real asks are an anecdote about recall and a fair check of silence (43 real mails with nothing to close).

## 2. Results

| reading | wrong Do It on the 43 real mails with nothing to close | real third-party asks found (of 2) | owner's test mails: right / missed / wrong action (of 28 decided) |
|---|---|---|---|
| engine as it was this morning | **1** (a reply draft on a Google Calendar "Appointment booked" notice) | 1 | 13 / 2 / 2 |
| engine + v2, engine + v3.3 (lab models) | 1 | 1 (the models add nothing here) | 13 / 2 / 2 |
| engine now, shipped default (calendar-notice quiet) | **0** | 1 | 13 / 2 / 2 |
| engine now, with the direct-ask reader on (off by default) | **0** | **2** | 14 / 1 / 2 |

- **The most valuable real mail was missed.** A client's mail with six numbered Hebrew questions about a price quote got no card. The person answered it by hand, twice. The classifier does not read a plain information question as an ask; the lab models, trained on template mail, did not either.
- **The lab models do not transfer to this mailbox:** v2 and v3.3 recover none of the misses and add no wrong Do It. The 18-point gain of v3.3 on the frozen set is a gain on generated mail.
- **Silence on real noise held:** one wrong Do It in 43, now fixed at the sender level.
- **No real mail here carries two kinds of close.** Decomposition changed nothing on this mailbox. The real multi-intent mails are the OWNER'S OWN outbound mails (a date accepted, an invitation asked for, an address to add, two things asked in advance), which this single-mail runner does not judge.
- Of the two wrong actions on the owner's tests, both are "add a row to the sheet" and "add a paragraph to the doc": the lab judge answers with a reply draft; in the product a Google close owns them, and the lab cannot run it. One miss is a file ask the file chain owns (same limit).

## 3. What changed in the engine today (each with a corpus; 26 checks in `test/direct-ask-corpus.cjs`)

1. **Shipped default, a silence fix:** `calendar-notification@` is an automated sender (`core/extract.js`), so Google Calendar's own notices get no reply draft.
2. **Built, OFF by default (`directAskOn`, no host passes it): the direct-ask second read** (`core/incoming-judge.js`). Two shapes the classifier does not read: (a) plain information questions a PERSON puts to the reader, at least two, or one in a mail that greets the reader by name: one reply draft, no date invented; (b) a Hebrew bare imperative with a day («מלא את הטופס, חתום והחזר עד מחר», «תשלם את החשבונית עד יום חמישי»): work is a task, a payment or send-back a reply. Strict: a person (not an automated sender, auto-reply, bounce or calendar notice), addressed To the reader, at most three recipients, only the mail's own text above any quoted header, hedges and sales questions skipped, a question that names a clock left to the calendar readers. It runs last of the second reads, so every quiet and every earlier reader wins.

With the reader ON, on the valid scoreboard (`run.cjs --decompose`, `GLANCE_DIRECT_ASK=1`): frozen wrong Do It 21/299 engine alone and 19/299 with v3.3, unchanged; wrong actions unchanged (12, 15 with v2, 17 with v3.3); one more engine miss recovered; validation 007+008 unchanged. On 7,977 teacher-labelled training mails it changes 1 decision and adds 0 offers on a silent mail. Declared: the rule "a question that names a clock is not a direct ask" was added after one frozen row (a meeting proposal) came out as a reply draft.

Surfaces: the reader sits in the shared judge, so Gmail, Outlook and the Gmail add-on bundle carry the same code (bundle rebuilt); it is off on every surface until a host passes the flag. Chats (WhatsApp, Messenger, Instagram): n/a, they use their own readers. Full corpora: 270 files, 3 browser harnesses fail as they did before this change (`follow-gmail-harness`, `gate-0950-proof`, `owa-page-harness`).

## 4. What the real mailbox says Glance has to be

The pain in this mailbox is not reading mail. It is **open loops in both directions inside a stream that is half noise**:

1. **Someone asked me something, and an answer is the close.** Real asks arrive as plain questions, often several in one mail, with no "please" and no date. This is the commonest real inbound loop and the one the engine missed.
2. **I asked someone for something, and I am waiting.** Most of the person-written threads here start with the owner's own mail. What comes back decides the loop: an out-of-office with a return day (hold until that day, not closed), "we have our own systems, thanks" (closed: declined), a one-word opt-out (closed, and a duty not to write again), a bounce (the address is wrong: fix and resend), a meeting link (the thing asked for arrived: closed). None of these inbound mails needs a Do It of its own, and all of them change a loop.
3. **Everything else must stay silent.** 38 of 46 non-test mails carry nothing to close.

So the unit of value is the **loop over a thread**, not the single mail: opened by an ask (mine or theirs), carried, and closed by the event that really closes it. A single-mail scoreboard cannot see whether Glance does that.

## 5. Next steps, cheapest first (none needs spend)

1. **A thread-level check on real mail:** for each real thread, does the follow loop open on the owner's ask, hold on an auto-reply until its day, close on a decline, an opt-out or a delivery, and flag a bounce? The code exists (`core/follow-up.js`, `core/reply-meaning.js`, `core/model-plan.js closeFor`); it has never been measured on real threads. This is the measurement that matches the product.
2. **Owner decisions:** turn the direct-ask reader on behind its switch on Gmail first (needs «מאשר» and a live Gate); a convention for a one-word opt-out reply.
3. **The structured teacher run (about $5):** it labels generated mail. This mailbox shows the lab models do not carry over to real mail, so its expected value for the product is low until a real-mail check says otherwise. Recommended: hold it.

## 6. Later the same day: on by the owner's approval, on every surface that runs the shared judge; the thread check; execution after Do It

**The direct-ask reader is ON** (owner, 2026-11-12, in session). It is not a Gmail feature: the Chrome extension on Gmail, the extension on Outlook and the Gmail add-on all pass `directAskOn` to the one shared judge. Off switch: the `directAskOn` flag each host passes (one line per host; no storage switch, the Labs list is for closes that ship off). No live Gate was run; the headless suite runs in CI on a pull request.

| change | Gmail (extension) | Outlook (extension) | Gmail add-on (phone card) | chats: WhatsApp, Messenger, Instagram, Teams | Safari iOS |
|---|---|---|---|---|---|
| direct-ask reader | on | on | on for a task plan; a reply-only plan is left to the surfaces that can draft, as every reply plan there is | **done 2026-11-13** (section 7): one-to-one chats only, at least two business questions, a task to answer, no email draft | n/a, the surface does not exist yet |
| the reply draft in the language of the ask; the answer frame for a mail of questions; no echo of the sender's greeting | done (shared composer) | done (same composer) | n/a, the card writes no draft | follow-up: the chat draft has its own composer | n/a |
| follow loop: real outgoing asks open a loop; an opt-out and "we have our own systems" close it as declined; a Hebrew out-of-office holds it | done (shared `core/follow-up.js`) | done | n/a, no follow loop on the card | done where the chat lanes use the same follow loop | n/a |
| Google Calendar notices are an automated sender | done | done | done | n/a | n/a |

**Thread-level check on 8 real threads** (`run-owner-threads.cjs`; the owner's own outgoing ask, then what came back; masked, private, gold by Claude in one pass):

| | before | now |
|---|---|---|
| a follow loop opens on the owner's ask | 2 of 8 | 8 of 8 |
| the reply does to the loop what a careful reader expects | 1 of 8 | 7 of 8 |

Before: the way a person really asks in a business mail («נשמח לתאם פגישה קצרה», «נשמח לקבל את שם...», «אשמח שתשלחי זימון») opened no loop, a one-word opt-out was read as an acknowledgement (the loop would have chased a person who asked to be left alone), and a Hebrew out-of-office closed a loop. Still open: a bounce only holds the loop (there is no "the ask never arrived, fix the address" state), and a reply that delivers one of three things asked closes the whole loop.

**Execution after Do It** (`flow-trial-extension/test/execution-coverage-corpus.cjs`, 89 checks, Gmail, Outlook and chat through the shared judge): every step a card can carry has a writer and an undoer in `src/background.js`; Outlook gets no Gmail draft and no Drive step, Gmail no Outlook step. Three defects found and fixed in the shared draft composer (`core/draft-reply.js`), so on every surface that drafts:

1. **A Hebrew ask got an English draft** (the generic reply step never named its language). The draft is now written in the language of the ask.
2. **A mail of questions got a draft that quoted only the first question.** It is now an answer frame: every question as written, in order, with a place for the person's answer under each. Glance writes no answer.
3. **The draft repeated the sender's greeting to the reader** ("Thanks. I'll follow up on: Hi Sali, could you..."). The quoted ask now starts at the ask.

What this does NOT prove: the lab cannot run a writer against Google or Microsoft (no account, no browser), so "has a writer" is a registry check, not a proof that the write lands and reads back. That proof is ProofOfClose on a live Gate. Read from code only, not run: on Outlook the shared judge's reply plan still names a `googleTask` after the Outlook draft and a meeting names `calendar`; the Outlook host maps both at run time.

## 7. Chats (2026-11-13): the direct-ask reader in WhatsApp, Messenger, Instagram and Teams

Glance is on every platform the person works in, so the reader is not finished at email. A chat is different in three ways, and the reader is stricter there:

- **One-to-one only, asserted by the host.** `src/chat-task-card.js` already drops groups, the person's own messages and quoted text; it now also passes `oneToOne: true` to the shared judge, and the judge reads nothing in a chat unless that is true (a group, a missing flag, or `fromMe` all stay silent).
- **Questions only, and business-like ones.** Openers: what, which, how much or many, is there, do you have; «מה», «כמה», «איזה», «האם», «יש». Not where, when, who, why or how: those are everyday chat. At least four words each, and at least TWO such questions (one question in a chat is conversation, not a loop). The Hebrew bare imperative with a day is not read here: `core/chat-deadline-ask.js` owns it.
- **No email draft.** The person types the answer in the chat. The card is a task to answer («לענות: <first question> (ועוד 1)» / "Reply: ... (+1 more)"), with no day invented, and it closes on the person's own reply in that chat, as the other chat cards do.

Corpus: 11 chat checks added to `test/direct-ask-corpus.cjs` (36 in all). Still behind the existing `CHAT_TASK_CARD` Labs switch: the chat card itself is off by default, so the reader reaches a person only where they turned the chat card on. Not run against a live chat; the chat page parsers were not touched.

## 8. The bounce (2026-11-13) and what was already there for partial delivery

- **A bounce is now its own outcome** (`core/follow-up.js`: `isBounce`, `isBounced`, `unbouncePatch`; `src/follow.js`). A delivery-failure mail (mailer-daemon or postmaster sender, or the wording: undeliverable, delivery failed, address not found, «המסירה לנמענים ... נכשלה», «כתובת הדואר האלקטרוני ... לא נמצאה») is not a reply from the person and says nothing about the ask. It no longer reads as an out-of-office. The loop stays open and flagged (`stage: 'bounced'`, `bouncedAt`), never counts as a reply, never closes, is not offered a next move or a chase, and the person gets one line: "Your message to X did not arrive ... send it again. I kept the loop open and will not chase until you do." Their next message in the thread is the resend: the flag clears and the chase clock runs again. **Outlook** has the same behaviour through its own sync (`core/outlook-sync.js`: the bounce flags the loop, one line, the next message of yours clears it; 3 checks in `test/outlook-sync-corpus.cjs`). Limit: on Outlook a delivery-failure notice usually arrives as a SEPARATE conversation, so it links to the loop only when Graph puts it in the same one; read from code, not run against a live mailbox.
- Thread check on the 8 real threads: the reply handled as a careful reader expects, **7 of 8 -> 8 of 8** (the opened loops stay 8 of 8). Corpus `test/follow-real-threads-corpus.cjs`: 26 checks.
- **Partial delivery (corrected 2026-11-13).** Earlier in this section it said loops over named documents already have partial delivery. That was over-claimed: `applyReplyItems` exists in `core/follow-up.js` but no host calls it, so on a real mailbox it never ran. What is built and wired now is section 9.
- **Outlook plans:** read from code (not run): the Outlook host builds the meeting write as `outlookCalendar` (`src/content-outlook.js`, the hold paths) and treats a process that has a draft with its task step unused, by the shared judge's own design (`forSurface`). The earlier concern is a naming in the shared plan, not a wrong write.

## 9. Parts: one message that asks for several things (2026-11-13)

The real thread: the owner's mail asked for a meeting invitation AND two questions («על איזה תהליך תרצו לראות את ההדגמה? ומי ישתתף?»). The reply was one meeting link. The loop closed, and two of the three things asked were still open.

- **When the loop opens,** the message is split into its parts (`core/follow-up.js partsOf`): the sentences that ask (a question, or the existing ask patterns), at least two, the lead-in before a colon dropped, the person's own words, at most six. The watch carries them (`parts`). Single asks are unchanged (no parts).
- **When a reply comes,** `applyReply(watch, reply, now, replyText)`: if the reply would close the loop, and it answers none of the open parts, and it is SHORT (14 words or fewer), the loop stays open (`stage: 'partial'`, the answered parts marked, the chase day moved) and the person is told what is still open. A part counts as answered when the reply shares a word with it (a stem match, because Hebrew inflects) or, for a part that asks for an invitation or a link, when the reply carries a link. The rule errs toward "answered": a wrong "answered" only gives back today's behaviour (the reply closes the loop); a wrong "open" would hold a loop that is done. A longer reply is read as the answer. A decline, a payment, a file delivery, an out-of-office and a bounce behave as before.
- **Both hosts:** Gmail (`src/follow.js`: a receipt line and the reminder moves) and Outlook (`core/outlook-sync.js`, same line). Chat loops carry parts too through the shared core; the chat lane receipt is not touched.
- Real thread th-7 now stays open on the two questions (it closed before). Thread check: 8 of 8 as expected, with that thread now judged strictly. Corpus: `test/follow-real-threads-corpus.cjs` 37 checks (13 for parts), `test/outlook-sync-corpus.cjs` 3 more.
- **This is the decomposition idea feeding the follow loop, not `core/intent-decompose.js` itself** (that module reads a mail the person RECEIVED and stays off). Not built: closing each part separately by the part's own proof (a question answered by a real answer, a document by a file read back), a card that lists the open parts, and a loop opened from a RECEIVED mail with several asks (the person's side: each ask its own Do It, which is what Decompose v1 is for and is still unwired).
