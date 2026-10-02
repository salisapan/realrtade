# Glance as an open-loop system

> Written 2026-10-01. Sits under `docs/product-architecture.md` and
> `docs/decision-filter.md`. Everything marked **built** exists and is tested;
> the real-Gmail script in §6 is the part only a person with a Gmail account
> can run.

## 1. The identity shift

Glance used to describe itself as an email intention detector. It still does
that, and still does it quietly. But the thing a person will pay to keep is
different:

> I pay for Glance because it stops important money and replies from
> disappearing. It stays on the loop until it is closed.

Email is the door. The **open loop** is the house: something you are owed (an
answer, a signature, a payment) that stays open until reality closes it.
Gmail is only where Glance sees it start and finish. Nothing in this change
moves outside Gmail, leaves the device, or adds a team or enterprise surface.

What stays exactly as it was: Do It (Calendar, Tasks, drafts, Undo), the free
local judgment, Stripe and the licence flow, the Pro panel, the waitlist and
trial plumbing, zero-prompt UX, `REMOTE_CLASSIFY = false`.

## 2. The object: a loop

A loop (a "watch" in code, `core/follow-up.js`) carries: who owes it, what was
asked, the amount if it is money, the day to look again, how many times you
chased, whether they promised a date, and how it ended.

```
opened ──► waiting ──► nudged ──► closed
              │           │
              └─ promised ┘   (they gave a date; the next look moves to it)
```

| Transition | What causes it | What Glance does |
|---|---|---|
| open | your newest message asks for something and you tap **Stay on it** | creates the Google Task on the chase day, stores the loop |
| nudged | your next message in the thread reads as a chase ("following up…") | counts it, moves the next look out (reply: +2 business days; payment: +3 days), moves the Task |
| promised | they answer with a date or an "I will" | keeps the loop open, moves the next look to the promised day (payment: the day after) and moves the Task |
| closed (reply) | a real answer to a request for a reply | completes the Task, one-line receipt with **Reopen** |
| closed (paid) | on a payment loop, they say it was paid; or you tap **Mark paid** | same |
| reopened | **Reopen** on a receipt or in the Loops tab | loop back on the list, fresh next-look day, Task reopened |

## 3. Closure intelligence: what does NOT close a loop

Closing a loop that is still open is the one expensive mistake, so every
doubtful case keeps it open.

| Their message | Outcome |
|---|---|
| Out-of-office, `noreply` sender, delivery failure | ignored |
| "Got it, thanks" / "will look into it" (short, no figures) | acknowledged, loop stays open, nothing shown |
| "I'll get back to you by Friday" | promised: next look moves to Friday |
| "Confirmed, the figure is $4,200" | closed |
| Payment loop: "payment sent", "I paid yesterday", Hebrew "העברתי" | closed as paid |
| Payment loop: "not paid yet", "once it is paid", "לא שולם" | never closes |
| Payment loop: any other reply | asks once: "Is it paid?" with **Mark paid / Keep chasing** |
| An answer followed by a "thanks!" | the answer wins, closed |

## 4. The one sharp Pro wedge

**Money on the line, and a chase that gets firmer.** Pro is protection plus
pursuit, not an "AI pack":

- Every loop until it closes (Free follows 3 at a time).
- The total still owed to you, and what was paid this month.
- Three nudge levels: friendly (free), firmer, last and direct (Pro). Each is a
  draft you edit and send, never sent for you.
- Draft-It and attachment summaries stay, as "also".

Free keeps the whole loop mechanic on up to 3 loops, including closing by reply
and the first nudge, so the value is felt before it is asked for. Nothing that
already worked for free was taken away.

## 5. The Magic Moment, in loop terms

The first time a loop closes **by itself**: you asked, you forgot, and Glance
tells you "Dana says it is paid ($4,200) after 12 days. Loop closed." That is
the receipt of a thing that would otherwise have been lost. The path to it:
Stay on it (opening receipt says it is on the loop and when it will look
again) → time passes → the answer arrives → a one-line closed receipt.

## 6. Manual Gmail test script (real Gmail, two accounts or one + a friend)

Not verifiable by any harness. Run before turning `PRO_PUBLIC=1` on. Use a
throwaway thread; "A" is the account with Glance, "B" is the other person.

1. **Offer.** From A, send B: *"Could you please confirm the final figure by Monday so I can book the vendor?"* Open the sent thread. Expect one card: "Waiting on a reply?" with **Stay on it** / **Not now**. A courtesy-only email ("Thanks, let me know if you have questions") must show nothing.
2. **Open the loop.** Tap Stay on it. Expect "I'm on this one now…" and a Google Task named *Chase reply from B* due on the stated day.
3. **Acknowledgement.** B replies only "Got it, thanks!" Open the thread as A. Expect **nothing**; the loop is still in the Loops tab.
4. **Out-of-office.** Have B's auto-reply (or "I am out of the office until…") arrive. Expect nothing; still open.
5. **Promise.** B replies "I'll get back to you by Friday." Expect "B promised it for Fri… I moved your reminder to…" and the Task due date moved.
6. **Chase.** As A, write in the same thread *"Hi, just following up on this. Any update?"* and send. Reopen the thread once. Expect "Chase noted…", the loop shows "Chased 1 time" in the Loops tab, the next look later.
7. **Firmer nudge.** In the Loops tab, the button now reads "Draft a firmer nudge" (Free: "· Pro"). With a Pro key it creates a Gmail draft in the thread, nothing sent.
8. **Close by reply.** B answers with substance ("Confirmed, it is $4,200."). Open the thread. Expect "B replied after N days. Loop closed.", the Task completed, a **Reopen** button.
9. **Reopen.** Tap Reopen. Expect the loop back on the list, the Task open again, and the same reply *not* closing it again.
10. **Payment.** From A send *"Invoice #3049 for $4,200 attached, due next Monday. Please pay by then."* Expect "Waiting on a payment?". Stay on it. The Loops tab shows $4,200 (Pro: also the owed total).
11. **Payment reply that is not payment.** B: "Sent to accounting, will check." Expect "B replied. Is it paid?" — **Keep chasing** leaves it open, **Mark paid** closes it as paid.
12. **Payment confirmation.** B: "Payment sent today, confirmation attached." Expect the loop to close by itself as paid, with the amount in the receipt.

Pass = all twelve behave as written, with no card in steps 3 and 4 and no
console error. Anything else is a defect to fix before launch.

## 7. Risks to precision and trust, and how each is held

- **A wrong close** (loop closed that is still open). Held by the table in §3:
  doubtful means open, payment loops close only on a payment statement.
- **A wrong card** (offering a loop for a courtesy line). Unchanged from the
  earlier corpus: precision over recall, silence over a wrong card.
- **A false chase** (an ordinary message counted as a nudge). Only
  chase-shaped wording counts; tested against ordinary replies.
- **Gmail markup drift.** The reply is read from the message body element when
  present, the whole row otherwise. Real Gmail may differ from the test page;
  step 1–12 above are how that is caught.
- **The Free cap is local-only.** Said plainly in `docs/monetization.md`.

## 8. Two more dimensions (added 2026-10-01, second pass)

**What you promised.** The mirror of everything above. If your own message says
"I'll send you the numbers by Friday" or "אחזור אליך מחר", Glance offers one
card ("You promised something", **Remind me**), sets a Task on the day, and
closes the loop as *kept* when a later message of yours delivers it ("attached",
"here is", "מצורף"). Their reply never closes a promise of yours, and a second
promise is not delivery. It is kept apart from money owed to you. A thread holds
one loop: what you asked of them wins over what you promised.

**Local recognition of thousands of phrasings.** `core/request-types.js` reads a
sentence as FRAME (how it is asked) + ACTION (what is wanted) + OBJECT (of
what), in English and Hebrew. 11 actions x 14 objects (and none), asked or
promised, in two languages: 660 request types, each reachable through dozens
of phrasings, all by deterministic code with no model. This is the standing
rule in `docs/local-first-principle.md`. The type also sets the chase day
(scheduling 1 business day, quotes and deliverables 3, payments 7).
Honest limit: this is breadth by vocabulary, not understanding. A phrasing
outside the lexicon is silent, never guessed. Tests: `test/request-types-corpus.cjs`.

Extra real-Gmail steps for these:

13. **Typed ask.** From A send: *"Could you please sign the NDA by Friday?"* Expect the "Waiting on a reply?" card even though no earlier phrasing covered it.
14. **Your promise.** From A send: *"Sure, I'll send you the revised numbers by Friday."* Expect "You promised something". Tap Remind me, then reply in the thread *"Hi, attached are the numbers."* Expect "Promise kept… Loop closed." If instead the other person replies, nothing should close.

## 9. Five more dimensions (built 2026-10-01, third pass)

All local, all deterministic (`docs/local-first-principle.md`), all silent when
unsure. Tests: `test/loop-dimensions-corpus.cjs` plus harness and storage cases.

1. **Meetings that ended with actions** (`core/meeting-debrief.js`). When Do It puts a meeting on the Calendar, Glance remembers its title and date only. From the day after, for ten days, the Loops tab asks "What came out of it?". You type one line each ("Dana to send the contract by Friday", "I will share the deck", Hebrew too); each line with a real action becomes a loop, yours or theirs, with a Task. Chatter is skipped. Nothing is read from your calendar.
2. **Things that run out** (`core/expiry.js`). A message stating "valid until Oct 31", "your trial ends", "renews on", "תקף עד" gets one card offering to look again three days before. Only validity wording counts; "due by" asks belong to the other lists. Sales, discounts, coupons, newsletters and no-reply senders are ignored. Shown in the Loops tab with days left, then "Lapsed".
3. **Replies you owe that go stale.** Still Open rows now say how long it has been on you ("On you 5 days"), amber from 3 days, red from 7. Display only: no new card or notification.
4. **Things that come around again** (`core/recurrence.js`). From the days you opened loops with the same person for the same kind of thing, Glance learns a rhythm: at least three occurrences, regular gaps, between a week and about three months. When the next is due it shows "Around Oct 13 — you have asked about every month". **Pro** shows what and when and offers a Task; Free sees one line that something comes around again.
5. **A person view.** "By person" in the Loops tab groups everything open with each person, both directions, most overdue first, with the money they owe (Pro).

Counting: expiry reminders and debrief loops count toward the Free limit of 3
open loops like any other loop. Local data added: meeting titles and dates, and
loop-open dates per person (never message text), capped.

Extra real-Gmail steps:

15. **Meeting.** Do It a message that proposes a meeting on a date, then (or change the date to yesterday in a test) open the Loops tab the next day. Expect "After your meetings". Type *Dana to send the contract by Friday* and *I will share the deck*, tap Add to loops. Expect two loops.
16. **Expiry.** Receive (or send yourself from another account) *"This quote is valid until October 31, 2026, so please let us know."* Expect "This offer ends Sat, Oct 31" and a reminder three days before. A promotional email with "40% off, offer ends…" must show nothing.
17. **Aging.** Leave a Still Open item for 3+ days: the age turns amber.
18. **Rhythm.** After three monthly loops with the same person, the Loops tab shows "Coming around again" near the next date (Pro).
19. **By person.** With two or more loops open, switch to By person.

## 9a. Closure intelligence, second pass (built 2026-10-02)

The loop gained one more state and three more ways to read a reply. Detail and
measurements: `docs/local-detection-plan.md`.

- **`yours` (the ball is back with you).** They wrote, but they need something:
  a question ("which invoice?"), a counter-offer ("how about Wednesday?"), a flat
  need ("I need the VAT number before I can approve"), or they could not use what
  you sent ("I never got the attachment", "the link is broken", `לא קיבלתי`). The
  loop stays open, the chase to them stops, the Google Task is retitled
  ("Answer Dana") and moved to the next business day, and the Loops tab says
  "Your turn · they asked you something". When you answer, the ball goes back and
  the chase restarts. Nothing to manage.
- **`declined`.** A plain no ("we decided not to proceed", `לא מעוניינים`) is a
  real answer: the loop closes, recorded as declined, with Reopen. On a payment a
  no is a pushback, so it becomes `yours` instead of closing.
- **One story, many threads (`core/story.js`).** An answer in a new thread settles
  the loop it belongs to when it is the same person and the same normalised
  subject, a shared reference number (INV-204, PO 7731, `חשבונית 2041`), or the
  same amount on a payment loop. Two plausible loops means no match. The same
  rule stops a second loop being opened for a story already followed.
- **Short chasers.** "Any update?", "Signed yet?", "Paid?", `מה הסטטוס?`: two-word
  chases open a loop (or count as a chase of one already open). Only on your own
  message, only the whole message, only with a question mark.
- **Soft acknowledgements.** "No worries, take your time" and "can't wait to see
  it" no longer close a loop; before, anything not recognised was assumed to be an
  answer.
- **Measured.** Every message decision is counted as local hit, local silence or
  residual, and every reply as rule or default (counts only, in `recognitionStats`).

Real-Gmail steps (open → carry → advance → close), two accounts or one plus a friend:

20. **Question back.** Send *"Please confirm the final figure by Monday so I can book the vendor."* and tap Stay on it. From the other account reply *"Which vendor do you mean?"* Expect the loop NOT to close; the receipt says it is yours now; the Google Task is called "Answer …" and due next business day; the Loops tab shows "Your turn".
21. **Hand back.** Reply with the answer. Expect "Sent. I am back on it", the Task title back to "Chase reply …" with a new chase day.
22. **Could not open it.** Repeat 20 with the reply *"I never got the attachment"*. Expect the same, labelled "could not open or find what you sent".
23. **No.** Repeat with *"Unfortunately we decided not to go ahead."* Expect the loop closed with "said no", and Reopen on the receipt.
24. **New thread.** Send an invoice ask with "INV-204" in the subject, tap Stay on it. From the other account start a NEW email titled *"paid"* saying *"Paid INV-204 today"*. Open it. Expect the first loop closed as paid. Then send a second ask about INV-204 in a new thread: expect no second card.
25. **Two-word chase.** In a thread with no loop send just *"Any update?"* Expect the Waiting on a reply card. Send *"Thanks!"* in another: expect nothing.
26. **Soft ack.** Reply from the other account *"No worries, take your time."* Expect the loop to stay open.
27. **Hebrew.** Repeat 20, 23 and 25 in Hebrew (*"איזו חשבונית?"*, *"החלטנו לוותר"*, *"מה הסטטוס?"*).
28. **Counts.** In the extension's storage (chrome://extensions → service worker → Application) `recognitionStats` should show counts only. No text.

## 9b. Still not built

- Reading the Calendar itself to find meetings Glance did not create.
- A morning summary line combining all of the above.
- Per-person notes or history beyond open loops.

## 10. What was built

`core/follow-up.js` (stages, `classifyReply`, `applyReply`, re-chase dates,
three nudge levels, `summarize`, reopen), `core/entitlements.js`
(`nudgeGate`), `src/follow.js` (the cards and receipts), `src/background.js`
(reschedule and reopen Task writes), the popup Loops tab, the site and
pricing copy, and the tests listed in `docs/monetization.md` §4.
