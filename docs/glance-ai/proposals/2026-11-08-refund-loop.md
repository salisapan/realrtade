# The refund you asked for, carried until the money is back

- **Status:** experiment built (2026-11-11, Wednesday run; not approved by Sali yet: no «כן» or «לא» since Sunday, so this run took it as the newest measured gap)
- **Date:** 2026-11-08 (product lab, Sunday run)
- **Switch:** `opts.enabled` on `FlowRefundLoop.ask`, `.reply` and `.judge` (`REFUND_LOOP`, **off**; nothing calls it). It joins `core/labs-switches.js` only when it is wired.
- **Code:**
  - `flow-trial-extension/core/refund-loop.js`
  - corpus `flow-trial-extension/test/refund-loop-corpus.cjs` (73 checks)
  - held-out score `scripts/refund-loop-heldout.cjs` on `glance-ai/eval-data/refund-loop-heldout-v0.jsonl` and `-v1.jsonl`
  - dormant real-user A/B: experiment `refund-loop` in `core/pmf-metrics.js`

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

## Experiment built (Wednesday 2026-11-11)

### What changed since Sunday

Today's changes are the edge cases from "Size", in Hebrew and English. Each one is pinned in the corpus, which went from 50 checks to 73.
- **Store credit instead of money** («זיכוי לחנות», «שובר», "store credit", "travel voucher") is a new stage, `store-credit`. It is never "approved" and never a close: the person decides whether to take it (release) or insist. A refund to the card that happens to mention a voucher code stays approved.
- **"Once we receive the item"** («לאחר שנקבל את המוצר») is `needs-you` with `need: 'return-item'`, not approved.
- **More ways to say approved:** «הכסף יוחזר לכרטיס», and "refund to your original payment method was approved".
- **"Can I get a refund?"** opens a loop.
- **A refund in parts:**
  - a smaller credit from the named merchant is counted (`partialPatch`, once per notice id) and never closes the loop;
  - the credit that completes the amount closes it;
  - a part from an unnamed credit is never counted.
- **The card descriptor:** the merchant's own mail-domain label (at least 4 letters, not a generic word such as "shop") names the merchant, as in "MAKERSPACE*BOOKING" or "STREAMLY.COM". The legal name around the brand («אלקטרה צריכה בע"מ») still names it.
- **Cashback, points and promotions** («קאשבק», «נקודות», «במסגרת מבצע») are not a refund.
- **Dormant real-user A/B:** experiment `refund-loop` in `core/pmf-metrics.js`.
  - The arm is fixed by the install id, and only when the switch is on.
  - It keeps counts only: refunds asked, lines shown, money back seen, not back by the merchant's day, released, and reopened after a close (the wrong-close signal).
  - Both arms count refunds asked and money back, so the rate compares carrying with not carrying.
  - No text leaves the device. Turning it on needs the owner and a privacy-page change in the same commit.

**Disclosed:** a credit counted as a part is reported as "not a close". The held-out scorer now maps `partial` to none, and the v0 label for the $25-of-$49 case (none) is unchanged.

### Offline A/B on a fresh held-out set (v1)

- **The set:** `refund-loop-heldout-v1.jsonl`: 24 new cases, 14 Hebrew and 10 English, none copied from the corpus.
- **Frozen:** in commit `f6c00d92` (sha256 `77dd326a…`) after today's code was written and before it was scored, and scored once.
- **Disclosure:** I wrote both the set and the code.

| part | arm | lang | should n | right | missed | should not n | wrong |
|---|---|---|---|---|---|---|---|
| ask | A | all | 5 | 0 | 5 | 5 | 0 |
| ask | **B** | all | 5 | **5** | **0** | 5 | **0** |
| ask | B | he | 3 | 3 | 0 | 3 | 0 |
| ask | B | en | 2 | 2 | 0 | 2 | 0 |
| reply | A | all | 6 | 0 | 6 | 0 | 0 |
| reply | **B** | all | 6 | **6** | **0** | 0 | 0 |
| reply | B | he | 3 | 3 | 0 | 0 | 0 |
| reply | B | en | 3 | 3 | 0 | 0 | 0 |
| close | A | all | 3 | 0 | 3 | 5 | 0 |
| close | **B** | all | 3 | **3** | **0** | 5 | **0** |
| close | B | he | 2 | 2 | 0 | 3 | 0 |
| close | B | en | 1 | 1 | 0 | 2 | 0 |

**Sunday's code on the same v1 set:**
- asks: 5/5;
- merchant replies: **2/6**. It missed «הכסף יוחזר לכרטיס» and both store-credit replies, and it read "after we receive the item" as approved;
- closes: 3/3, with **1 wrong close**: cashback from the same merchant for the same amount.
- Today's edge cases fix all five.

**In the routine's terms (v0 and v1 together):**
- **wrong Do It** (a refund loop opened where none is owed): 0/13;
- **missed close:** 0/8 (A: 8/8);
- **wrong action** (a close on the wrong proof, or a reply read as the wrong stage): 0/14 closes that must not close, and 0/12 replies that need a stage.

### Recommendation

**Keep `REFUND_LOOP` off and wire it next.**
- The ask goes on the sent-mail hook in `src/follow.js`, the reply on the same thread, and the credit on the opened-mail hook that `outside-signals` uses. The notice is read back by id before the close.
- Before the labs switch: a mock of the line («החזר משופ · ₪189 · עד 26/11») for the owner, and a live Gate.
- The offline numbers are clean, but the n are small and from one author. The real-user A/B is what will show whether carrying a refund raises the share of refunds that are actually seen back.

