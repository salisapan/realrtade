# Resolution paths: finishing what takes more than one step

> Written 2026-10-03. Companion to `docs/file-backed-closure-plan.md` (single-file closure), `docs/open-loops.md`,
> `docs/decision-filter.md` (§5.8 of `docs/product-architecture.md`), `docs/local-first-principle.md`.
> Code: `flow-trial-extension/core/resolution.js` (pure), `src/follow.js` (the card and the loop),
> tests: `test/resolution-corpus.cjs`, `test/follow-gmail-harness.cjs` sections 32 and 32j (documents).

## 1. The problem, in one example

"Can you send me the receipt?" looked like one action: find a file, attach it. It is not. Done means *a receipt for this
payment, from this person, actually delivered to them*. Between the ask and that sentence there are up to five different
situations, and a macro that handles one of them hides the other four:

| Situation | What the old single action did | What is true |
|---|---|---|
| The receipt already exists in Drive or the thread | Attached it (right) and said "Handled." | Right file, but a draft is not a delivery |
| It does not exist, nothing is confirmed | Stayed silent | A receipt certifies a payment: first find out whether the payment happened |
| It does not exist, the payment is real | Offered a blank-template card (when a template existed) | Receipts are issued by whoever is legally the issuer: ask them, never invent one |
| The money is still being chased | Same as above | No receipt can honestly exist yet |
| Someone sent a message that says "attached" | Closed on the words in some paths | Only a real attachment is delivery |

## 2. The model (six steps, skipped only when truly unnecessary)

```
define -> find existing -> verify -> prepare | request -> deliver -> confirm/close
```

1. **Define.** `doneDefinition()`: "A receipt for ₪3,850 sent to Dana, as a real attachment". Stored on the loop, shown on
   the card ("Done when: …"), and the same words in the popup. This is the test delivery has to pass.
2. **Find existing** (`findExisting`). A file in this thread (sent by me or by a third party, never by the requester: it is
   theirs) or exactly one file in Drive. One match: prepare the reply with it. Two: choose nothing, offer a plain draft.
   A template is not a receipt. A file whose name does not fit is not guessed at.
3. **Verify** (`paymentStatus`), only for artifacts that attest a payment (receipt, transfer proof) and only when nothing
   exists yet. *Skipped when a receipt is found*: an issued receipt could not exist without the payment. Evidence, strongest first:
   a loop of mine already closed as paid (same person, same amount); a bank/processor email the person opened for this amount
   in the last 120 days (kept as amount + day only); the person's own "yes, it is paid" (labelled theirs). Contradicted by a loop
   still chasing this person for this money, or by the person's "not yet".
4. **Prepare or request.** In this order: a draft with the found file; else a draft asking *the one who issues receipts*
   (an address the person typed once); else, only if the host can open the create card and the payment is confirmed by
   something other than the person's say-so, the existing template card; else say plainly that it cannot be issued here and
   ask who issues them (or let the person issue it themselves). **Never generates or issues one, never sends anything.**
5. **Deliver.** The person sends. Glance has no send path.
6. **Confirm/close** (`judgeDelivery`). The only way a resolution closes: *a message I sent, in this thread, with a real
   attachment named for the thing* (or the single attachment of a message that itself names it). "Attached" with no attachment,
   no attachment, a page that cannot list attachments, a differently named file: all keep it open (the last two ask one
   question). A close the person makes by hand is recorded as theirs (`resolvedBy: 'manual'`).

One loop carries the whole path (`watch.resolution`: object, done-text, stage, a bounded trail, the last status line and
move). Direction `mine`, one Google Task reminder, one place in the popup. A step never opens a second loop.

## 3. The receipt example on today's Google stack

| Need | Source today | Honest limit |
|---|---|---|
| Is there a receipt already? | Drive search (`drive.readonly`), real attachments of this thread's messages | No search of other threads (the Gmail scope is compose-only), no file contents: matching is by file name |
| Did the payment happen? | Bank/processor emails the person opens (amount + day kept), the person's own closed payment loops, the person's say-so | No bank connection: if the person never opened the confirmation, Glance asks |
| Ask the issuer | A Gmail draft to an address the person typed | Not sent. The issuer's answer lands in another thread that Glance does not read on its own; it advances when the person opens the original thread (the Drive search and the thread are looked at again) |
| Deliver | The person sends the draft | Glance cannot send |
| Close | The person's own message with a real attachment, seen when the thread is open | If Gmail's page cannot list attachments, it asks instead of closing |

## 4. What this slice built, and what it did not

Built: the pure planner and delivery judge; payments-seen and issuer storage; the follow card (one card, one move at a time,
the path advances after each tap); the loop with its status line; popup row; Do It chip steps aside for receipts and transfer proofs
so nothing says "Handled." over an unsent draft; the issuer's file arriving in another thread advances the same loop; privacy page and store copy; 114 core checks and 38 browser checks.

Wired to receipts and transfer proofs first, and since 2026-10-04 also to **the documents the person sends: contract, quote, proposal, signed copy** (`CLASSES` in `core/resolution.js`; no payment step; `docs/true-close.md` §4).
A file ask that planner does not own (an invoice, a letter, a deck, and the same shape of ask in either language) uses the one close chain in `core/close-chains.js`: search the connected sources, attach the one file that is really there, and when it is not there say so. A template is not that file. The planner still recognises invoice, tax invoice and statement as words; it does not issue them.

## 5. What needs future connectors (not faked here)

- **A billing/invoicing connector** (Morning/Green Invoice, iCount, QuickBooks, Stripe invoices): to *issue* a receipt,
  look up whether one exists for a payment, and know the issued number. Today the path ends at "ask the issuer" or "you issue it".
  `plan()` returns `future: 'billing-connector'` on exactly that move.
- **A banking/payments read connector**: to verify a payment without relying on an email the person happened to open.
- **A CRM connector**: to know who issues receipts for which customer, and the customer's history, instead of one typed address.
- **Gmail read (search) scope**: to find the issuer's reply and a receipt in other threads. This is a bigger permission
  decision (the extension is compose-only today); it should come with its own privacy-page change.

## 6. Before / after

| Moment | Before | After |
|---|---|---|
| Dana: "send me the receipt for the ₪3,850 retainer"; one file in Drive | Do It chip, draft created, "Handled." | Card: "Found Receipt - Dana retainer.pdf. Draft ready to review; it is not sent. Done when: A receipt for ₪3,850 sent to Dana, as a real attachment." Loop opens on the tap; closes when the sent message carries that file |
| Same, no file anywhere, nothing confirmed | Nothing (or a blank-template card) | "I cannot find a payment of ₪3,850 from Dana. Was it paid?" -> yes -> "Payment is confirmed, but no receipt exists and I cannot issue one. Who issues your receipts?" -> saves the address -> "Ask Noa Books to issue it" (a draft, not sent) |
| Dana is still being chased for that money | Template card offered | "The payment of ₪3,850 from Dana is not confirmed, so no receipt yet. I will keep this open." No draft |
| You send "Receipt attached." with nothing attached | Some paths closed on the words | "Your message says the receipt is attached, but nothing is attached. I kept this open." |
| You send IMG_2231.pdf with "See attached" | Closed or ignored | "Did the receipt go out?" (one tap either way); "yes" closes it as your own call |

## 6b. The issuer is a person, not an attachment (2026-10-04)

Asking someone to issue a receipt hands the loop to them, so what they SAY now moves the path (core/resolution.js
`readIssuerAnswer`, using the same reply reader every loop uses, plus a narrow "we do not issue" lexicon that a condition
("until it clears") turns back into a delay):

| They write | The path does | Never |
|---|---|---|
| a file named for it | offers the reply to the original requester with that file (draft) | attaches or sends |
| "I will send it on Wednesday" | records the day, moves the reminder to it, no chase before it | closes |
| "we do not issue these" | releases the request, never asks them again, asks who else issues receipts | waits forever |
| a question ("which name?") | says once that they asked YOU something | answers for you |
| "done" with nothing attached | says no file came, keeps it open | closes |
| thanks / out of office | nothing | - |
| nothing for 3 days (or the promised day passed) | one reminder to them, a draft, then waits again | sends it |

## 7. Decision filter (§5.8)

You intend, we execute: the ask now becomes a path to the real artifact, not one action. Feeling of closure: it closes only on delivery, and says what it is waiting for in between. Precision and silence: no wrong file, no receipt for an unconfirmed payment, nothing sent. Zero-Prompt: the only question is "was it paid?" (once, one tap) and, once ever, who issues receipts. Compounding value: payments seen, the issuer and closed payment loops make the next receipt request a one-tap path.

## 8. Known limits and open checks

- Never run on real Gmail; the browser harness imitates Gmail's structure (like the others).
- Matching a file is by name, not content. One guard exists: a name that states ANOTHER amount ("Receipt ₪2,000.pdf" for a ₪3,850
  request) is dropped; only a number with a currency mark or a thousands separator counts, so "Receipt-7731" is a number, not a price.
  A file called "Receipt Oct.pdf" for another payment, with no amount in its name, would still be offered. The draft says the amount
  and the person reviews it before sending.
- Payment evidence matches on amount and recency, not on who paid (the bank email's text is deliberately not kept). Guard: when
  someone else is still being chased for the same amount, a bank email is not taken as proof for this person and Glance asks. Two
  clients who both paid the same amount in the same week, with no loop to tell them apart, would still both read as paid.
- The issuer's reply is picked up when ANY thread with it is opened (one loop that asked that address, one file named for it; two
  loops on one issuer need the message to name an amount). It only offers the reply to the original requester with that file; the
  person taps, the draft is not sent, the loop stays open.
- Several requests for different receipts in one thread are one loop (the first clear ask).
