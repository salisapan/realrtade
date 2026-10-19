# The invoice you sent is the open loop

- **Status:** proposed
- **Date:** 2026-10-18 (product lab, Sunday run)
- **Switch:** `CARRY.invoices` in `flow-trial-extension/config/carry.public.js`, **off**
- **Code:**
  - `flow-trial-extension/core/outside-signals.js`: `invoiceLoop`, `paymentTerms`, and the matcher reading `amountNet` for invoices sent "+ מע"מ"
  - corpus `flow-trial-extension/test/invoice-loop-corpus.cjs` (84 checks)
  - held-out score `scripts/invoice-loop-heldout.cjs` on `glance-ai/eval-data/invoice-loop-heldout-v0.jsonl`

## בעברית, בקצרה

פרילנסר שולח ללקוח «מצורפת חשבונית 1044 על סך 3,850 ₪», ולא כותב «תשלם בבקשה». היום Glance לא פותח על זה כלום, ואף אחד לא עוקב אחרי הכסף.

ההצעה: החשבונית ששלחת היא הלולאה. Glance קולט ממנה:
- את הסכום;
- את מספר החשבונית;
- את מועד התשלום מהתנאים, למשל «שוטף+30», «net 30», «תוך 14 יום» או «לתשלום עד 15/11».

הוא נשאר על הלולאה עד שהכסף באמת מגיע: «שילמתי», מייל מהבנק על אותו סכום, או «העברתי» בוואטסאפ.

הוא שותק על קבלה, הצעת מחיר, חשבונית זיכוי, חשבוניות לרואה החשבון, הודעה שהועברה, ו«אשלח חשבונית מחר».

בניסוי על סט שלא כוונן מראש:
- נפתחה לולאה על 10 מתוך 12 חשבוניות שבאמת חייבים עליהן כסף. היום: 2 מתוך 12.
- נוספה לולאה שגויה אחת.

זה בדיוק סיפור הכניסה הנעול: «אף שקל לא נופל בין הכיסאות».

## The gap (evidence)

1. **Today a sent invoice opens nothing.** I ran `core/follow-up.js` `classifyOutgoing` on 8 typical sent-invoice mails. 6 of 8 open no loop, for example:
   - «מצורפת חשבונית מס 1044 על סך 3,850 ₪»
   - «מצ"ב חשבונית עסקה… שוטף +30»
   - "Invoice attached, $1,200"

   The follow loop needs an explicit payment ask ("please pay", «אפשר להעביר»). An invoice is the ask, and freelancers rarely write one on top of it.
2. **Terms are lost.**
   - "due in 30 days" opens a loop with no deadline.
   - «שוטף+30», the Israeli default (end of this month plus 30 days), is not read anywhere in `core/`.
   - `extract.parseDate` does not read day-first dates such as «15/11».
3. **The owner's positioning, 2026-10-18** (`docs/product-identity.md`):
   - first user: an Israeli freelancer or small business on Gmail + WhatsApp;
   - entry story: «אף שקל לא נופל בין הכיסאות» (invoices, payments, reminders).

   Holistic close map **Y3** "Chase money you are owed" is *partial*: it starts only from a chase mail.
4. **The closers already exist.** The client's "paid" reply (`classifyReply`), a bank or processor email for the amount (`matchPayment`), and the same message in WhatsApp (`core/cross-channel.js`, linked by amount) already close a payment loop. What was missing is the loop.

This is not the AI-engine routine (M1–M8), not a breadth-builder row move (Y3 stays partial until a live Gate), and not Dima's queue. It does not touch Morning, which is on hold: Glance tracks an invoice the person sent and never issues one.

## The user moment

Sali sends a client a PDF invoice with one line, «מצורפת חשבונית לחודש אוקטובר, 4,200 ₪, שוטף+30». Nothing appears. On 1 December the Waiting-on card shows **«דנה: תשלום על חשבונית · 4,200 ₪ · היה אמור להגיע אתמול»**, with a firm, polite nudge ready.

If the bank email «התקבלה העברה בסך 4,200 ש"ח מדנה כהן» arrives first, the loop closes on its own with a receipt and Reopen. Sali never has to remember it.

## How it closes (ProofOfClose)

The loop closes only on a payment signal that was read, never on the invoice or the nudge:
- **(a) the client's reply** that it was paid. The reply is the proof (`docs/true-close.md` §3).
- **(b) a trusted bank or processor email** for the same amount that names the client. That is a strong close with a receipt. An unnamed one is a single question («Looks paid: Mark paid?»).
- **(c) the same message in another app**, linked by the amount.

Then there are the person's own controls: Mark paid, or Let it go (a deliberate release). A nudge is a draft and never a close. Undo and Reopen work as on any payment loop.

## A/B

- **A (today):** `classifyOutgoing` alone.
- **B (new):** A, then `invoiceLoop` when A opens nothing. With the switch off, B = A (pinned).
- **Data:** the corpus (in-sample, 14 sent invoices and 18 must-stay-quiet mails), and a **held-out set frozen before scoring** (24 mails, 12 Hebrew and 12 English, sha256 `16e6433c…`). The code was not tuned to the held-out set.
- **Metrics:**
  - missed loop on an invoice that is really owed;
  - wrong loop on a mail that owes nothing (the wrong-Do-It analogue: a wrong chase card);
  - wrong amount;
  - wrong due day;
  - payment signals that close the loop.

### Held-out (`node scripts/invoice-loop-heldout.cjs`)

| arm | lang | owed n | loop opened | missed | not owed n | wrong loop | wrong amount |
|---|---|---|---|---|---|---|---|
| A | all | 12 | 2 | 10 | 12 | 2 | 0 |
| **B** | all | 12 | **10** | **2** | 12 | 3 (**1 new**) | 0 |
| A | Hebrew | 6 | 0 | 6 | 6 | 0 | 0 |
| B | Hebrew | 6 | 5 | 1 | 6 | 0 | 0 |
| A | English | 6 | 2 | 4 | 6 | 2 | 0 |
| B | English | 6 | 5 | 1 | 6 | 3 (1 new) | 0 |

**B missed:**
- «היי, שלחתי לך את החשבונית על הצילומים» ("I sent" is past tense: the invoice may have gone out earlier);
- "Sending over the invoice".

**B's one new wrong loop:**
- "Attached the signed contract. I'll invoice $5,000 once we kick off." The not-yet rule does not know "I'll invoice".

**Today's own wrong loops**, which B inherits and does not add:
- "Got your invoice for $1,980, I'll pay it by Friday";
- "disregard the earlier invoice for $850".

Both are `follow-up.js` reading a figure plus a payment word as money owed to you. That file is inside open PR #164, so this run does not change it.

### In-sample corpus (`node test/invoice-loop-corpus.cjs`)

| arm | lang | invoices sent | loop opened | missed | wrong loop on 18 quiet (B adds) | wrong amount | wrong due day | payment signals that close it (3 per loop) |
|---|---|---|---|---|---|---|---|---|
| A | all | 14 | 4 | 10 | 2 | 0 | 0 | 12 |
| **B** | all | 14 | **14** | **0** | 2 (**0 new**) | 0 | 0 | **42** |
| A | Hebrew | 8 | 2 | 6 | 1 | 0 | 0 | 6 |
| B | Hebrew | 8 | 8 | 0 | 1 (0 new) | 0 | 0 | 24 |
| A | English | 6 | 2 | 4 | 1 | 0 | 0 | 6 |
| B | English | 6 | 6 | 0 | 1 (0 new) | 0 | 0 | 18 |

**How to read it:**
- The in-sample numbers are tuned and are not the result; the held-out table is.
- "Payment signals that close it": every opened loop is closed by each of the three real signals, its client's reply, its bank or PayPal email and its WhatsApp message, in the loop's language and currency.
- **Known miss** (`follow-up.js` reply words): "Just sent you $3,850" is not read as paid, so the loop stays open; it is pinned in the corpus.

**Switch off and the other corpora:**
- With the switch off, `invoiceLoop` returns null on every text.
- `matchPayment` behaves as before on any loop without `amountNet`.
- `outside-signals-corpus` and `multi-platform-corpus` pass.
- 121 of 128 corpora pass. The other 7 are red on the base with identical failures: `background-write`, `card-decision`, `flip-sample-0956`, `gmail-outlook-parity`, `google-closes`, `outlook-runner`, `outlook-sync`.

## Risks and what stays locked

- **A wrong chase card** is the harm: 1 new wrong loop of 12 on the held-out set. It is a card with a nudge draft, never a send, and Let it go removes it. That is still too many for real users. The Wednesday fix is below, measured on a new held-out set.
- **Your own payables** must never become "money owed to you": «קיבלתי את החשבונית שלך», a transfer confirmation you send, a forwarded supplier invoice. They stayed quiet in both sets.
- **Two invoices or two different totals** in one mail: silence.
- **Locked:**
  - a payment loop never closes on the invoice itself;
  - nothing is sent;
  - no mail text leaves the device;
  - with the switch off, nothing changes;
  - the card waits for the owner's mock.

## Size: what Wednesday can finish

1. **The three held-out errors**, then a new frozen held-out set v1, so the fix is measured on cases it was not written for:
   - add "I'll invoice" and «אוציא לך חשבונית» to not-yet;
   - read "sending over" as on-this-message;
   - read «שלחתי לך את החשבונית» only when a file is attached.
2. **Invoicing-system copies.** Morning / Green Invoice / iCount email the client and copy the person ("חשבונית נשלחה ל…"). Read that copy as the same loop, which needs no Morning API.
3. **The real-user A/B** through `core/pmf-metrics.js` (already dormant): per-arm counts of loops opened, closed by a payment signal, and released.
4. **For the owner:** the two `follow-up.js` wrong loops above, to fix after #164 merges.
