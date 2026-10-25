# A bill is closed only when it is paid

- **Status:** proposed
- **Date:** 2026-10-25 (product lab, Sunday run)
- **Switch:** `opts.enabled` on `FlowBillPaid.judge` (**off**; nothing calls it). It joins `core/labs-switches.js` as `BILL_PAID` only when it is wired, so no switch is shown to the person before it does something.
- **Code:**
  - `flow-trial-extension/core/bill-paid.js`
  - corpus `flow-trial-extension/test/bill-paid-corpus.cjs`
  - held-out score `scripts/bill-paid-heldout.cjs` on `glance-ai/eval-data/bill-paid-heldout-v0.jsonl`

## בעברית, בקצרה

חשבון שקיבלת («חשבונית 4471 על סך 2,340 ₪, לתשלום עד 10/11») כבר יכול להפוך למשימה «לשלם», מאחורי המתג `PAYMENT_ASK`. אבל משימה היא הכנה, לא תשלום. היום אף אחד לא יודע אם הכסף באמת יצא.

ההצעה: Glance סוגר את החשבון רק כשיש הוכחה שהוא שולם. הוכחה היא אחת מאלה:
- **קבלה מהספק** על אותו סכום או על אותה חשבונית;
- **מייל מהבנק, מכרטיס האשראי או מביט** שהכסף יצא לאותו ספק, בשמו;
- **ה«שילמתי» שלך** לספק, או אישור העברה שצירפת.

ובמקרה ההפוך: כשעבר יום התשלום ואין הוכחה, החשבון מופיע ברשימת «עבר המועד ולא שולם».

Glance לא משלם ולא נוגע בבנק.

בסט שהוקפא לפני כתיבת הקוד:
- 9 מתוך 9 חשבונות ששולמו קיבלו החלטה: 8 נסגרו עם הוכחה, ובאחד בלי שם נמען Glance שואל פעם אחת. היום: 0 מתוך 9.
- 0 סגירות שגויות על 9 מלכודות.

## The gap (evidence)

1. **A bill's close today is the task, not the payment.** Commit `de7249d` turns a stated bill into a Pay task behind `PAYMENT_ASK` (off). The task is written and read back. Nothing in `core/` closes a payable on a payment signal:
   - `core/outside-signals.js` reads only money coming IN, and explicitly drops "money going out";
   - `core/follow-up.js` payment loops are money owed TO the person.
2. **I probed today's judge on 6 bills received** the way they really arrive: «מצורפת חשבונית… לתשלום עד 10/11», "invoice #8812… Due November 15". With `PAYMENT_ASK` off, all 6 are silent. With it on, they become a task at best.
3. **The locked rule:** "treats preparation as not completion"; "Waiting or tracking alone is not success; true close is". The locked positioning (2026-10-18) gives the entry story «אף שקל לא נופל בין הכיסאות». It has two sides: money owed to you (#171, `invoiceLoop`) and money you owe.
4. **Holistic close map Y5** "Pay a bill" is **none**. Its ProofOfClose column says "The task id only. Paying is a later, separate approve". This proposal supplies the proof that the bill was paid, without paying.

This is not the breadth builder's row move: Y5 stays none until a live Gate. It does not touch `PAYMENT_ASK` or `core/chat-payment-ask.js`, which owns the task. It is not Dima's queue or the AI engine.

## The user moment

Sali has «חשבון רו"ח לוי · 2,340 ₪ · עד 10/11» on the steps list. On 3 November the bookkeeper's mail arrives: «מצורפת קבלה מספר 4471 על סך 2,340 ₪. תודה על התשלום». The bill closes with the receipt as its proof: **«שולם — הקבלה של משרד לוי»**, with Reopen. The Pay task is completed.

If nothing arrives by 11 November, the morning list shows **«משרד לוי · 2,340 ₪ · היה לתשלום אתמול, אין הוכחה שנשלם»** with Pay and Mark paid.

## How it closes (ProofOfClose)

The close is `{ status: 'paid', proof: { system: 'mail', externalId: <message id>, fetchedBack: <the caller read it>, verifiedAt, kind: 'payee'|'bank'|'own' } }`. Undo / Reopen puts the bill back.

| evidence | rule | verdict |
|---|---|---|
| payee | from the payee's address or their organisation's domain (never free mail), receipt words, the same amount or invoice number | close |
| bank | a trusted bank, card or provider sender (`outside-signals` list), money-out words, the same amount, a recipient that names the payee | close |
| bank, no recipient named | as above, with no recipient in the message | one question |
| own | the person's own message to the payee: "paid" words, and the amount, the invoice number or a transfer-confirmation file | close |

**Never proof:**
- failed or declined;
- scheduled, future, or a standing order «יחויב / בהוראת קבע»;
- a reminder or «טרם שולמה»;
- money coming in;
- a refund;
- a payment to someone else;
- a promise to pay;
- an untrusted sender;
- a different amount.

Two bills that fit equally: silence.

## A/B

- **A (today):** a Pay task is never closed by a payment signal, so every paid bill stays unproved.
- **B (new):** `FlowBillPaid.judge`.
- **Data:** the held-out set `bill-paid-heldout-v0.jsonl`.
  - 18 bill + message pairs, 10 Hebrew and 8 English: 9 paid, 9 traps.
  - Written and frozen (sha256 `f96ca93b…`) before `core/bill-paid.js` was written, and scored once.
  - **Disclosure:** I wrote the cases and then the code the same hour, so the set is not blind the way a third party's would be. The in-sample corpus (36 checks) adds more traps.

### Held-out (`node scripts/bill-paid-heldout.cjs v0`)

| arm | lang | paid n | closed with proof | asked once | missed | not paid n | wrong close | wrong ask |
|---|---|---|---|---|---|---|---|---|
| A | all | 9 | 0 | 0 | 9 | 9 | 0 | 0 |
| **B** | all | 9 | **8** | 1 | **0** | 9 | **0** | 0 |
| A | Hebrew | 5 | 0 | 0 | 5 | 5 | 0 | 0 |
| B | Hebrew | 5 | 5 | 0 | 0 | 5 | 0 | 0 |
| A | English | 4 | 0 | 0 | 4 | 4 | 0 | 0 |
| B | English | 4 | 3 | 1 | 0 | 4 | 0 | 0 |

**How to read it:**
- The one "asked once" is the label: a Chase debit "A payment of $640.00 was made from your account" names no recipient, so Glance asks instead of closing.
- **Wrong close = 0** on the traps:
  - the payee's reminder;
  - a failed Bit transfer;
  - money coming in from the same person;
  - a standing order;
  - the same amount by Bit to another person;
  - a failed card;
  - "I'll pay next week";
  - a refund;
  - a scheduled payment.

**Corpora:** `bill-paid-corpus` (36 checks) passes, and so do all 207 corpora. With the switch off, `judge` returns null on every input. Nothing else calls the module.

## Risks and what stays locked

- **A wrong "paid"** is the harm: a bill that was not paid closes, and a late fee follows. Hence:
  - a payment to someone else is silence even for the same amount;
  - a debit with no recipient is a question, never a close;
  - two bills that fit are silence;
  - every close has Reopen.
- **A bank email is evidence only from a trusted sender domain**, never from a display name.
- **Locked:**
  - Glance never pays and never opens a bank;
  - no mail text leaves the device;
  - the proof keeps the message id, not its text;
  - with the switch off nothing changes.
- **UI:** the "paid" receipt and the "past due" line are Glance's own card and morning list. A mock goes to the owner first; there is no new page.

## Size: what Wednesday can finish

1. **Wire it where the Pay task is born** (`PAYMENT_ASK` in `src/content-gmail.js`, `src/content-outlook.js`, the chat card): record the open bill (payee, amount, invoice number, due day, task ref) next to the task.
2. **Feed `judge` from the mail the person opens and sends.** These are the same hooks `outside-signals` uses for money coming in.
3. **On a close, complete the Pay task** (Google Tasks / To Do), and add `BILL_PAID` to the labs list, off.
4. **A second frozen held-out set**, written by a different routine, plus the real-user A/B experiment `bill-paid` in `core/pmf-metrics.js`: bills paid with proof, paid by hand, past due.
