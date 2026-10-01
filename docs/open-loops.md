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

## 8. What was built

`core/follow-up.js` (stages, `classifyReply`, `applyReply`, re-chase dates,
three nudge levels, `summarize`, reopen), `core/entitlements.js`
(`nudgeGate`), `src/follow.js` (the cards and receipts), `src/background.js`
(reschedule and reopen Task writes), the popup Loops tab, the site and
pricing copy, and the tests listed in `docs/monetization.md` §4.
