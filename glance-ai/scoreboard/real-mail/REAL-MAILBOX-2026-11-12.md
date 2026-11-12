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
