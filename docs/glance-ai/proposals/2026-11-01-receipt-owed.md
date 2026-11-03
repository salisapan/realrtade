# The receipt you owe once you are paid

- **Status:** proposed
- **Date:** 2026-11-01 (product lab, Sunday run)
- **Switch:** `opts.enabled` on `FlowReceiptOwed.owe` and `.judge` (`RECEIPT_OWED`, **off**; nothing calls it). It joins `core/labs-switches.js` only when it is wired, so the person never sees a switch that does nothing.
- **Code:**
  - `flow-trial-extension/core/receipt-owed.js`
  - corpus `flow-trial-extension/test/receipt-owed-corpus.cjs` (57 checks)
  - held-out score `scripts/receipt-owed-heldout.cjs` on `glance-ai/eval-data/receipt-owed-heldout-v0.jsonl`

## בעברית, בקצרה

דנה שילמה לך 3,850 ₪. Glance כבר יודע לסגור את מעקב התשלום כשהכסף באמת נכנס (`MONEY_ARRIVED`). אבל לעצמאי בישראל הסיפור לא נגמר כאן: על הכסף הזה מגיעה לדנה קבלה. היום אף אחד לא זוכר את זה, אלא אם דנה ביקשה.

ההצעה: כשתשלום שמגיע לך נסגר על כסף אמיתי, נפתחת משימה אחת: «קבלה על ₪3,850 לדנה כהן». היא נסגרת רק כשיש הוכחה שהקבלה הגיעה לדנה:
- **מייל ששלחת לדנה עם קובץ קבלה מצורף**;
- **העותק ממערכת החשבוניות** (מורנינג, iCount ודומות) שאומר שקבלה נשלחה לדנה כהן.

Glance לא מפיק קבלה ולא שולח אותה.

בסט שהוקפא לפני כתיבת הקוד:
- 4 מתוך 4 תשלומים שמחייבים קבלה פתחו משימה, ו-0 משימות שגויות ב-10 מקרים שלא מחייבים (היום: 0 מתוך 4).
- 6 מתוך 6 קבלות שנשלחו סגרו את המשימה, ו-0 סגירות שגויות ב-10 מלכודות (היום: 0 מתוך 6).

## The gap (evidence)

1. **Nothing opens "a receipt is owed" after you get paid.**
   - `core/money-arrived.js` (#242) closes a payment loop as `paid`, `resolvedBy: 'notice'`, and stops there.
   - `core/follow-up.js` closes on the payer's "I paid" and stops there.
   - `core/resolution.js` handles a receipt only when someone **asks** for one ("Can you send me the receipt?").
   - `grep` over `core/` and `src/` finds no loop born from a paid close.
2. **The person this is for.** The locked first user is an Israeli freelancer or small business («אף שקל לא נופל בין הכיסאות»). For them a receipt for money received is an obligation, not a courtesy. It is the next step of the same money loop that #171 (invoice → payment loop) and #242 (money arrived) build.
3. **The locked rule.** True close is real completion. Today the money loop counts as closed while one thing is still owed on it.
4. **Not a duplicate.**
   - It does not issue receipts: Morning (invoices) stays on HOLD, and `docs/resolution-paths.md` keeps "never generates or issues one".
   - It is not the breadth builder's row move, Dima's queue, or the AI engine.
   - It touches no file that an open PR changes. `core/bill-paid.js` and `core/money-arrived.js` are in #249, and this module reads neither of them.

## The user moment

On Thursday, Hapoalim's notice «התקבלה העברה בסך 3,850 ₪ מדנה כהן» closes Sali's payment loop with Dana. The Loops panel moves it to Handled, and one line appears under it: **«קבלה על ₪3,850 לדנה כהן · עד היום»**, with *I sent it* / *Not needed*.

On Sunday, Morning's copy arrives: «קבלה מס' 0047 על סך 3,850 ₪ נשלחה בהצלחה אל דנה כהן». The line closes with that mail as proof, **«נשלחה — העותק ממורנינג»**, with Reopen.

If nothing arrives by Monday, two workdays later (skipping Friday and Saturday), the line is on the morning list.

## How it closes (ProofOfClose)

The close is `{ status: 'closed', closedAs: 'delivered', proof: { system: 'mail', externalId: <message id>, fetchedBack, verifiedAt, kind: 'own'|'issuer' } }`. A deliberate release ("Not needed": the invoice already was a «חשבונית מס קבלה», or it was not a business payment) is `closedAs: 'released'` with its reason. Reopen puts it back.

### When it opens

| rule | why |
|---|---|
| a payment loop owed **to** the person, `closedAs: 'paid'` | the money was theirs to receive |
| `resolvedBy` is `notice` (the bank or app) or `manual` (the person) | the payer's own "I paid" is a claim, and a receipt certifies money received |
| an amount, in shekels (or no currency on a Hebrew loop) | the Israeli receipt duty; dollars and no-currency English stay silent |
| not already a «חשבונית מס קבלה» / "invoice-receipt" | that document already is the receipt |
| the profile does not say `receiptsAuto` | an invoicing system that sends the receipt by itself needs no reminder |

### When it closes

| evidence | rule | verdict |
|---|---|---|
| own | a message the person **sent** to the payer (the same address, or the payer's organisation domain, never free mail), with a real attachment named as a receipt («קבלה», "receipt", «חשבונית מס קבלה»), and no other amount in the text | close |
| issuer | an allowlisted invoicing-system sender (domain suffix, never a display name) that passed authentication says a receipt was issued or sent to the payer **by full name**, with the same amount or no amount | close |

**Never proof:**
- "attached" with no attachment;
- an invoice file;
- "I'll send it tomorrow";
- a draft or preview («טיוטה», «טרם הופק»);
- a cancelled receipt;
- a receipt to someone else, or for another amount;
- only the payer's first name;
- the payer's "thanks for the receipt";
- a supplier's receipt to the person;
- a look-alike or unauthenticated sender.

Two owed receipts that fit equally: silence.

## A/B

- **A (today):** a paid loop opens nothing, so every receipt owed is missed and nothing closes one.
- **B (new):** `FlowReceiptOwed.owe` and `.judge`.
- **Data:** the held-out set `receipt-owed-heldout-v0.jsonl`.
  - 30 cases, 20 Hebrew and 10 English: 14 birth cases (a closed loop: should it open?) and 16 close cases (a message: does it prove delivery?).
  - Written and committed (`3717ddd`, sha256 `1d5856d9…`) before `core/receipt-owed.js` was written, and scored once.
  - **Disclosure:** I wrote the cases and then the code in the same hour, so the set is not blind the way a third party's would be. The in-sample corpus (57 checks) adds more traps: look-alike domains, failed authentication, only the first name, another gmail address, and two fits.

### Held-out (`node scripts/receipt-owed-heldout.cjs v0`)

| part | arm | lang | should n | done | missed | should not n | wrong |
|---|---|---|---|---|---|---|---|
| birth | A | all | 4 | 0 | 4 | 10 | 0 |
| birth | **B** | all | 4 | **4** | **0** | 10 | **0** |
| birth | A | he | 3 | 0 | 3 | 7 | 0 |
| birth | B | he | 3 | 3 | 0 | 7 | 0 |
| birth | A | en | 1 | 0 | 1 | 3 | 0 |
| birth | B | en | 1 | 1 | 0 | 3 | 0 |
| close | A | all | 6 | 0 | 6 | 10 | 0 |
| close | **B** | all | 6 | **6** | **0** | 10 | **0** |
| close | A | he | 4 | 0 | 4 | 6 | 0 |
| close | B | he | 4 | 4 | 0 | 6 | 0 |
| close | A | en | 2 | 0 | 2 | 4 | 0 |
| close | B | en | 2 | 2 | 0 | 4 | 0 |

**How to read it:**
- The n are small: 4 births and 6 closes to find. A perfect score on 30 cases from one author is a floor check, not a precision claim.
- **Wrong open = 0 on these 10:** a claim, a release, a combined invoice-receipt, `receiptsAuto`, dollars, money the person paid, a reply loop, no amount, a loop still waiting, and no currency in English.
- **Wrong close = 0 on these 10:** "attached" with no file, a receipt to someone else, a draft, an invoice file, a promise, the payer's thanks, a supplier's receipt, another payer, another amount, and a cancelled receipt.

**Corpora:** `receipt-owed-corpus` (57 checks) passes, and so do all 228 corpora. With the switch off, `owe` and `judge` return null on every input. Nothing else calls the module.

## Risks and what stays locked

- **A wrong "owed"** is noise on a money loop: a receipt asked for money that did not need one. Hence:
  - shekels only;
  - real money only, never a claim;
  - the combined document and `receiptsAuto` stay silent;
  - "Not needed" is one click and a true close.
- **A wrong "sent"** hides a receipt still owed. Hence:
  - a real file, to that payer;
  - the issuer's copy only from an allowlisted, authenticated domain, naming the payer in full;
  - a draft or a cancellation is never proof;
  - two fits stay silent;
  - every close has Reopen.
- **Locked:**
  - Glance never issues, generates or sends a receipt (`docs/resolution-paths.md`; Morning stays on HOLD);
  - no mail text leaves the device;
  - the proof keeps the message id, not its text;
  - with the switch off nothing changes.
- **UI:** the line under the Handled payment, and its receipt, are Glance's own Loops panel and morning list. A mock goes to the owner first; there is no new page.

## Size: what Wednesday can finish

1. **Wire the birth** where a payment loop closes as paid: `money-arrived` and the manual Mark paid in `src/follow.js` and `popup/popup.js`. Do this after #249 lands, because it changes `core/money-arrived.js` and `core/follow-up.js`. Store the owed receipt next to the loop.
2. **Feed `judge` from the mail the person sends and opens.** These are the hooks `outside-signals` and `resolution.judgeDelivery` already use. Close with the message read back by id.
3. **Hand it to `core/resolution.js` when the payer asks for the receipt anyway,** so one path carries it instead of two loops.
4. **A second frozen held-out set** written by a different routine, `RECEIPT_OWED` on the labs list (off), and the real-user A/B experiment `receipt-owed` in `core/pmf-metrics.js`: receipts owed, closed with proof, released, past chase day.
