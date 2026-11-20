# The chase that gets the refund done

- **Status:** proposed
- **Date:** 2026-11-15 (product lab, Sunday run)
- **Switch:** `opts.enabled` on `FlowRefundChase.plan` (`REFUND_CHASE`, **off**; nothing calls it). It is wired together with `REFUND_LOOP`.
- **Code:**
  - `flow-trial-extension/core/refund-chase.js`
  - corpus `flow-trial-extension/test/refund-chase-corpus.cjs` (31 checks)
  - held-out score `scripts/refund-chase-heldout.cjs` on `glance-ai/eval-data/refund-chase-heldout-v0.jsonl`

## בעברית, בקצרה

סאלי ענה ב-12/11: «לעשות דברים ולגרום להם להיות מבוצעים». לולאת ההחזר שאושרה יודעת **להחזיק** את ההחזר עד שהכסף חוזר, אבל כשהוא מתעכב היא רק אומרת «מאחר». היא לא עושה כלום.

ההצעה: לכל החזר שמתעכב, Glance מכין את **הצעד הבא האחד** שגורם לו לקרות, עם טיוטה מוכנה:
1. **אין תשובה, או שהתאריך שהחנות נתנה עבר:** תזכורת לחנות שמצטטת את מספר ההזמנה, את הסכום ואת **התאריך שהם עצמם נתנו**.
2. **שתי תזכורות בלי מענה במשך 5 ימי עסקים:** בקשה לחברת האשראי לברר את העסקה, עם שם הכרטיס, החנות, ההזמנה והסכום. אם לא ידוע איזה כרטיס שילם, Glance שואל שאלה אחת.
3. **החנות סירבה או הציעה זיכוי לחנות:** אתה מחליט: להתעקש, להסלים או לוותר.
4. **«נחזיר כשנקבל את המוצר»:** צעד להחזיר את המוצר.

כל עובדה בטיוטה באה מהלולאה עצמה, ואין מספר ממוצא. Glance לא שולח: אתה שולח בלחיצה. הטיוטה היא הכנה, לא סגירה. ההחזר נסגר רק כשהזיכוי מגיע.

בסט שהוקפא לפני הקוד (18 מצבים):
- הצעד הנכון: 13 מתוך 13. היום: 0, כי היום אין צעד בכלל.
- 0 צעדים שגויים ב-5 מצבים שבהם אין מה לעשות.
- 8 מתוך 8 טיוטות עם כל העובדות, ו-0 מספרים ממוצאים.

## The gap (evidence)

1. **The approved loop does not act.** `FlowRefundLoop.due()` returns `{ id, why }`: no answer, not back, declined, needs-you or store credit. It prepares no move and no draft. On the frozen set, today's right next step is 0 of 13.
2. **The owner's direction (Sali, 2026-11-12):** «מה שהכי נכון וקולע למהות של המוצר, לעשות דברים ולגרום להם להיות מבוצעים!». The locked loop is detect → carry → **execute** → true close. The carry exists; the execute step does not.
3. **Where refunds die.** They die at the second silence: the merchant said "approved, 14 days", nothing came, one reminder went unanswered. The step that works then is the card company's charge dispute, and people rarely take it because writing it is work. Glance has every fact it needs on the loop.
4. **Not a duplicate.**
   - `core/follow-up.js` next-move (2026-10-11) chases a reply loop by changing channel or person. It does not know a merchant's own date, a card or a dispute.
   - This is not the breadth builder's row move, Dima's queue, or the AI engine.
   - No open PR touches these files.

## The user moment

On 12/10 Sali asked Electra for a refund, and Electra wrote «ההחזר יופיע עד 26/10». On 2/11 and 5/11 Sali sent the reminders that Glance prepared, and both went unanswered.

On 15/11 the Loops line reads **«אלקטרה · 3,490 ₪ · שתי תזכורות בלי מענה»** with one Do It: **«בקשת בירור עסקה בישראכרט»**. It opens a draft:

«אבקש לברר עסקה בכרטיס ישראכרט מול בית העסק אלקטרה, הזמנה 88120. ב-12/10 ביקשתי מבית העסק החזר על סך 3,490 ₪. בית העסק כתב שההחזר יגיע עד 26/10, אך הזיכוי לא הגיע, ושתי תזכורות לא נענו. אבקש לבחון את ביטול החיוב.»

Sali adds the address and sends. When Isracard's credit arrives, the refund loop closes with that notice as proof.

## How it closes (ProofOfClose)

Unchanged from `refund-loop`. The close is the card, bank or payment-app credit from that merchant for that amount, read back by id (`FlowRefundLoop.judge`).
- A reminder or a dispute request is **preparation**. `remindedPatch` counts a reminder only after the person sent it, as seen in Sent and read back by id.
- No draft closes anything.
- Glance never sends.

| state | next move | draft |
|---|---|---|
| asked, past the chase day | `remind-merchant` | to the merchant: order, amount, the day asked |
| approved, past their day | `remind-merchant` | quotes **their** day: «כתבתם ש… יופיע עד 10/11» |
| a reminder younger than 5 workdays | nothing | — |
| 2 reminders, 5 workdays of silence, card known | `escalate-card` | to the card company: To is empty, the card is a hint, no address invented |
| the same, card unknown | `ask-card` | one question |
| declined, or store credit | `decide` | insist / escalate / release |
| "once we receive the item" | `return-item` | a step, no draft |
| they asked for something | `answer-them` | the order, plus `[מה שביקשתם]`; never a guess |

## A/B

- **A (today):** `due()` names why a loop is late. It prepares no move and no draft.
- **B (new):** `FlowRefundChase.plan`.
- **Data:** `refund-chase-heldout-v0.jsonl`.
  - 18 refund-loop states, 12 Hebrew and 6 English: 13 with a move due and 5 with nothing to do.
  - Frozen in `cac72b0e` (sha256 `c5fb8609…`) before the code was written, and scored once.
  - **Disclosure:** I wrote both the set and the code.
- **Scored:**
  - the right step;
  - every required fact in the draft (order, amount, their date, card, merchant);
  - no invented number: every digit run in a draft must come from the loop.

| arm | lang | moves due n | right step | wrong step | nothing due n | wrong move | drafts | all facts | invented number |
|---|---|---|---|---|---|---|---|---|---|
| A | all | 13 | 0 | 13 | 5 | 0 | 0 | 0 | 0 |
| **B** | all | 13 | **13** | **0** | 5 | **0** | 8 | **8** | **0** |
| B | he | 8 | 8 | 0 | 4 | 0 | 4 | 4 | 0 |
| B | en | 5 | 5 | 0 | 1 | 0 | 4 | 4 | 0 |

A perfect score on 18 cases from one author is a floor check, not a quality claim about the wording. The words of the drafts go to the owner as part of the mock.

## Risks and what stays locked

- **A dispute too early** costs the person's relationship with the merchant. Hence:
  - only after two reminders the person really sent, and 5 workdays of silence;
  - only when the person clicks;
  - a refusal or store credit is always a decision, never an automatic escalation.
- **A wrong fact in a letter to a card company** is worse than no letter. Hence every number comes from the loop, and the held-out checks that.
- **No address is invented.** The card company's address is the person's to add, until a verified list exists.
- **Locked:**
  - nothing is sent;
  - no mail text leaves the device;
  - a draft is never a close;
  - with the switch off nothing changes.
- **UI:** the Do It on the existing Loops line, and the draft in Gmail. A mock of the line and of both drafts goes to the owner first; there is no new page.

## Size: what Wednesday can finish

1. **Wire `refund-loop` and `refund-chase` together** behind their switches: the ask and the reminder on the sent-mail hook, the merchant's reply on the thread, the credit on the opened-mail hook, and the draft through the existing Gmail draft writer.
   - **Blocker:** `src/follow.js` is changed by open PR #121, a 0.9.40 store candidate marked "do not merge". Closing #121 frees it.
2. **The Outlook twin:** the same move through the Outlook reply draft. That is the surface rule of 22/10.
3. **Edge cases:** a merchant that answers in another language than the ask; a reminder the person edited before sending, which counts as sent; two refunds from one merchant.
4. **A second frozen held-out set,** plus the dormant real-user A/B `refund-chase` in `core/pmf-metrics.js`: moves offered, drafts sent, money back after a reminder, and money back after a dispute.
