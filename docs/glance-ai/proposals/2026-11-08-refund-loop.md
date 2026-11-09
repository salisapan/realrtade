# The refund you asked for, carried until the money is back

- **Status:** proposed
- **Date:** 2026-11-08 (product lab, Sunday run)
- **Switch:** `opts.enabled` on `FlowRefundLoop.ask`, `.reply` and `.judge` (`REFUND_LOOP`, **off**; nothing calls it). It joins `core/labs-switches.js` only when it is wired.
- **Code:**
  - `flow-trial-extension/core/refund-loop.js`
  - corpus `flow-trial-extension/test/refund-loop-corpus.cjs` (50 checks)
  - held-out score `scripts/refund-loop-heldout.cjs` on `glance-ai/eval-data/refund-loop-heldout-v0.jsonl`

## בעברית, בקצרה

חויבת פעמיים, ביטלת הזמנה, החזרת מעיל. כתבת לחנות «אבקש לבטל את העסקה ולזכות את הכרטיס». מכאן הכסף שלך תלוי בזיכרון שלך. החנות עונה «ההחזר אושר ויופיע תוך 14 ימי עסקים», ואף אחד לא בודק אם הוא באמת הופיע.

היום Glance לא פותח כלום על בקשת החזר (0 מתוך 8).

ההצעה: מהרגע ששלחת את הבקשה, Glance מחזיק אותה:
- **החנות אישרה ונתנה תאריך:** Glance זוכר את התאריך.
- **החנות סירבה:** Glance שם את זה לפניך להחלטה. זו לא סגירה.
- **החנות ביקשה ממך משהו:** Glance אומר לך מה.

המשימה נסגרת רק כשחברת האשראי, הבנק או PayPal כותבים שהזיכוי **מאותה חנות, על אותו סכום**, נכנס. «ההחזר בוצע» מהחנות עצמה הוא הבטחה, לא כסף.

Glance לא מזיז כסף.

בסט שהוקפא לפני הקוד (38 מקרים):
- בקשות: 8 מתוך 8 נפתחו.
- תשובות חנות: 6 מתוך 6 סווגו נכון.
- זיכויים: 5 מתוך 5 סגרו.
- 0 פתיחות שגויות ו-0 סגירות שגויות.
- היום: 0 בכל אחד מהשלבים.

## The gap (evidence)

1. **A sent refund request opens nothing today.** I ran today's `classifyOutgoing` (`core/follow-up.js`) on 6 real-shaped requests (3 Hebrew, 3 English), and every one returned `null`. On the frozen set it is 0 of 8.
2. **No module carries a refund.**
   - `refund` is only a word in the `money` lexicon of `core/request-types.js`.
   - `core/money-arrived.js` deliberately drops "refund to" notices.
   - `core/bill-paid.js` and `core/receipt-owed.js` treat a refund as "never proof".
3. **Holistic close map Y4, "A refund", is none.** Its own line says "Do not move money. Track the ask … The refund id".
4. **The locked positioning:** «אף שקל לא נופל בין הכיסאות». A refund is the most common shekel that falls: the merchant's "approved" is the moment people stop watching, and the credit is the moment that proves it.
5. **The owner's rule:** "claimed is not received" (2026-10-10). A merchant's "processed" is a claim; the card's credit is the receipt.

**Not a duplicate.**
- It is not the breadth builder's row move: Y4 stays none until it is wired and passes a live Gate.
- It is not Dima's queue or the AI engine.
- It touches no file that an open PR changes.
- It never moves money and never opens a bank page.

## The user moment

On Sunday Sali writes to the store: «שלום, חויבתי פעמיים על הזמנה 4471. אבקש להחזיר לי את החיוב הכפול על סך 189 ₪». The Loops panel adds, under Added: **«החזר משופ · ₪189 · ממתין לתשובה»**.

On Tuesday the store answers: «ההחזר אושר ויופיע תוך 14 ימי עסקים». The line becomes **«שופ אישרו · ₪189 · עד 26/11»**.

On the 20th Isracard writes: «זיכוי בסך 189 ₪ מבית העסק שופ נקלט בכרטיסך». The line closes with that mail as proof, **«הכסף חזר — זיכוי בישראכרט»**, with Reopen.

If the 26th passes with no credit, the morning list shows **«שופ אמרו עד 26/11 · ₪189 עוד לא חזרו»** with a prepared reminder draft that Sali sends himself.

## How it closes (ProofOfClose)

The close is `{ status: 'closed', closedAs: 'refunded', proof: { system: 'mail', externalId: <notice id>, fetchedBack, verifiedAt, kind: 'card' } }`. A deliberate release ("I took store credit") is `closedAs: 'released'` with its reason. Reopen puts it back.

| step | rule | result |
|---|---|---|
| opens | the person's own sent message to a business (not free mail), with a refund word («החזר», «לזכות», "refund", "reverse the charge") and a request form («אבקש», «נא», "please", "I'd like") | a loop with merchant, amount (only when one figure), order, chase in 5 workdays |
| stays silent | a policy question, a hedge, thanks for a refund, a promise to refund someone, a private address, a refund word with no request | — |
| merchant replies | approved (with the days they gave, else 10 workdays) / declined / needs-you | a stage, never a close |
| closes | a trusted card, bank or payment-app sender (the `outside-signals` list, authentication not failed): a credit, refund or «זיכוי», from that merchant, for that amount | close |
| asks once | the same, with the amount but no merchant named | one question |

**Never proof:**
- pending, or the next billing («יבוצע בחיוב הבא»);
- a charge;
- a refund the person sent;
- another merchant;
- a partial amount;
- another currency;
- the merchant's own "refund done";
- a look-alike or unauthenticated sender.

Two loops that fit: silence.

## A/B

- **A (today):** `classifyOutgoing` on the ask. With no loop, there is no stage for a reply and nothing to close.
- **B (new):** `FlowRefundLoop`.
- **Data:** `refund-loop-heldout-v0.jsonl`.
  - 38 cases, 20 Hebrew and 18 English: 16 asks, 8 merchant replies and 14 credit notices.
  - Written and committed (`07ccea46`, sha256 `1beff2d3…`) before `core/refund-loop.js` was written, and scored once.
  - After that, one in-sample corpus case (two figures in one sentence split by ", ") changed how amounts are split. The held-out re-score is identical.
  - **Disclosure:** I wrote both the cases and the code in the same hour, so the set is not blind.

### Held-out (`node scripts/refund-loop-heldout.cjs v0`)

| part | arm | lang | should n | right | missed | should not n | wrong |
|---|---|---|---|---|---|---|---|
| ask | A | all | 8 | 0 | 8 | 8 | 0 |
| ask | **B** | all | 8 | **8** | **0** | 8 | **0** |
| ask | B | he | 4 | 4 | 0 | 4 | 0 |
| ask | B | en | 4 | 4 | 0 | 4 | 0 |
| reply | A | all | 6 | 0 | 6 | 2 | 0 |
| reply | **B** | all | 6 | **6** | **0** | 2 | **0** |
| reply | B | he | 3 | 3 | 0 | 1 | 0 |
| reply | B | en | 3 | 3 | 0 | 1 | 0 |
| close | A | all | 5 | 0 | 5 | 9 | 0 |
| close | **B** | all | 5 | **5** | **0** | 9 | **0** |
| close | B | he | 3 | 3 | 0 | 5 | 0 |
| close | B | en | 2 | 2 | 0 | 4 | 0 |

**How to read it:**
- **Wrong open = 0 on 8:** a policy question (he and en), a hedge (he and en), thanks for a refund (he and en), and a promise to refund a friend (he and en).
- **Wrong close = 0 on 9:**
  - a credit «בחיוב הבא»;
  - a charge;
  - another merchant;
  - the merchant's "done";
  - a gmail look-alike;
  - PayPal pending;
  - a refund the person sent;
  - the merchant's "issued";
  - a partial $25 of $49.
- A perfect score on 38 cases from one author is a floor check, not a precision claim.

**Corpora:** `refund-loop-corpus` (50 checks) passes. With the switch off, `ask`, `reply` and `judge` return null. Nothing else calls the module.

## Risks and what stays locked

- **A wrong "refunded"** hides money still owed. Hence:
  - the card notice must name the merchant;
  - the amount must match exactly, so a partial refund stays open;
  - an unnamed credit asks;
  - two fits stay silent;
  - every close has Reopen.
- **A wrong "asked"** is noise. Hence:
  - a business address only;
  - a request form;
  - silence on hedges, questions and thanks.
- **Locked:**
  - Glance never moves money, never opens a bank or a store page, and never sends;
  - a reminder is a draft the person sends;
  - no mail text leaves the device;
  - the proof keeps the notice id, not its text;
  - with the switch off nothing changes.
- **UI:** the line in the Loops panel and the morning list are Glance's own card. A mock goes to the owner first; there is no new page.

## Size: what Wednesday can finish

1. **Wire the ask** where sent mail is read (`src/follow.js`, after the open PRs on it land). Wire the reply on the same thread hook, and the credit on the opened-mail hook that `outside-signals` uses. Read the notice back by id before closing.
2. **Edge cases:**
   - store credit offered instead of money («זיכוי לחנות», "store credit");
   - a refund split in two;
   - the merchant's legal name on the card («שופ אונליין בע"מ») against the brand in mail.
3. **A second frozen held-out set** written by a different routine, plus the dormant real-user A/B `refund-loop` in `core/pmf-metrics.js`: refunds asked, approved, money back, not back by their day, released.
