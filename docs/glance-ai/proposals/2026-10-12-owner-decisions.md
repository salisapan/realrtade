# Three owner decisions for Glance's own model, ready to approve

- **Status:** approved by Sali 2026-10-14 («מאשר הכל»): 1 (host type; the cap amount, below $50, still to be set, and nothing rented yet), 2 (the copy ships with the switch wiring, off), 3b (silence). Auto-merge rule approved and applied in `CLAUDE.md` with the owner's permission. Decision 3 is withdrawn 2026-10-14: the owner does not label by hand (decision 2026-10-11), and owner-verified labels now come from his own use (path A, `docs/glance-ai/learning-from-use.md`, approved 2026-10-13). Prepared 2026-10-12 after «תעשה הכל». Nothing in this file is switched on, deployed, rented or published.
- **Blocks:** `docs/glance-ai/ai-product.md` §7 rows 2, 3 and 4; `docs/open-tasks.md` rows 60 and 63.
- **Switches that stay off until each answer:** `aiPrimary`, `aiUnderstandingV1` (`flow-trial-extension/core/understanding-router.js`, `core/understanding.js`).

<div dir="rtl">

## בעברית, בקצרה

שלוש החלטות. כל אחת צריכה תשובה של מילה או שתיים. אחרי התשובה אני מבצע את כל השאר.

| # | מה | ההמלצה שלי | מה לכתוב לי |
|---|---|---|---|
| 1 | איפה המודל רץ ותקרת הוצאה | שרת GPU לפי שימוש, עם עותק של המודל שלנו בחשבון שלנו. תקרה: 50 דולר לחודש | «מאשר 1» או שינוי |
| 2 | נוסח פרטיות והסכמה | הטיוטה למטה. הענן לא שומר טקסט, וההסכמה כבויה עד שהמשתמש מדליק | «מאשר 2» או תיקונים |
| ~~3~~ | ~~תוויות batch-001~~ **בוטל 14/10: התוויות יגיעו מהשימוש שלך (מסלול A)** | 14 תשובות מוכנות בטבלה למטה, לפי מה שה-CTO סימן | «מאשר 3», או למשל «מאשר 3 חוץ מ-7: לשתוק» |
| 3ב | כלל: אישור סכום או תקציב (למשל «אישרנו 4,200») | לשתוק, ולא ליצור משימה. אין כאן בקשה ממך | «מאשר 3ב» או «משימה» |

## 1. איפה המודל רץ, ובכמה

**מה נמדד:** רק **19%** מהמיילים מגיעים לענן (150 מתוך 796, בנתב החדש). השאר מוכרעים במכשיר, בלי עלות.

**מה זה עולה** (`glance-ai/oss/cost/cost-tables.md`). המחירים נלקחו מחיפוש ב-12/10 ולא אומתו באתרי הספקים, אז צריך לבדוק אותם לפני שחותמים:

| אפשרות | לאדם לחודש (100 מיילים ביום) | מי רואה את הטקסט המוסווה |
|---|---|---|
| א. ספק שמריץ את המודל ומחייב לפי טוקנים (DeepInfra / Fireworks) | 5–20 סנט | הספק, חברה שלישית |
| **ב. שרת GPU לפי שימוש (Runpod / Modal), עם עותק שלנו של Qwen3.5-4B** | **6–13 סנט** | **רק השרת שלנו** |
| ג. שרת GPU קבוע שרץ כל הזמן | כ-280 דולר לחודש, לא משנה כמה משתמשים | רק השרת שלנו |

**ההמלצה: ב.** זה הכי קרוב לנעילה שלך, «המודל של Glance רץ בענן של Glance», כי שום חברת AI אחרת לא רואה את הטקסט. העלות לא תלויה בכמות משתמשים קבועה. תקרה של 50 דולר לחודש מספיקה לבערך 400 עד 800 משתמשים רגילים (100 מיילים ביום), ובתקרה המערכת עוצרת וחוזרת לעבוד רק במכשיר.

**מה אני אעשה אחרי «מאשר 1»:** אבנה את שרת המודל עם ספק מדומה (M3), את מונה התקציב ואת העצירה בתקרה. **השכרה בפועל וכרטיס אשראי** הם צעד שלך, או של דוד, בחשבון הספק. אני לא שוכר שרת ולא מפעיל מפתח בתשלום.

## 2. נוסח פרטיות והסכמה (טיוטה, לא פורסמה)

**מה משתנה במציאות:** היום יוצא משפט מוסווה אחד, ורק אם המשתמש הדליק "קריאה שנייה". בנתיב החדש יוצא **ההודעה האחרונה כולה, מוסווית**, אבל רק כשהמכשיר לא הכריע בעצמו (בערך מייל אחד מכל חמישה), ורק אחרי שהמשתמש הדליק. לפני שהטקסט יוצא מוחלפים בו שמות, חברות, סכומים, תאריכים, מיילים וטלפונים בסימנים. אם נשאר מייל או טלפון, הטקסט לא נשלח בכלל. השרשור הקודם, הנושא ומי כתב למי לא יוצאים.

**שתי הכרעות בתוך הטיוטה, לפי ההמלצה שלי** (אפשר לשנות):
- הענן **לא שומר** שום טקסט ושום תשובה.
- ההסכמה **כבויה** כברירת מחדל: שורה אחת במסך ההסכמה האחד, שהמשתמש מסמן בעצמו.

הנוסח באנגלית, כמו שהוא ייכנס לאתר ולתוסף:

</div>

### privacy.html §5: replace "Where that decision is made"

> **Where that decision is made.** On your device first. The code that settles most messages runs in your browser and makes no network request. When it cannot settle a message on its own, and only if you turned on *Glance's own model* (below), Glance asks its model.

### privacy.html §5: new paragraph, "Glance's own model"

> **Glance's own model: off until you turn it on.** Glance reads each message on your device first and settles most of them there. For a message it cannot settle (about one in five in our measurements), and only after you tick *Glance's own model* on the consent screen, it sends the newest message of that thread to Glance's own model, which runs on servers we rent and is not shared with any other AI company. Before it leaves your browser, the message is masked: names, companies, amounts, dates, email addresses, phone numbers and labelled identifiers become placeholders, and nothing is sent if an email address or a phone number is still in it. That masking can miss things, such as a first name used alone. The earlier thread, the subject and who wrote to whom are not sent. The model must quote the words its answer rests on; your device checks every quote against the message and reads any date itself. The answer is a suggestion only: you still tap, and it can never close, write or send anything. Our server keeps no message text and no answer. You can turn it off in the extension panel at any time, and Glance carries on on your device as before.

### privacy.html §5 "What we do not do": replace the bracketed sentence

> ~~(A separate automatic classification of whole messages exists in the code but is switched off; if it is ever turned on it will be opt-in and this policy will change first.)~~ → The masked message read by Glance's own model, only after you turn it on, is described above.

### Consent screen: one more row

> ☐ **Glance's own model.** For a message your device cannot settle, send that message, masked, to Glance's own model for a suggestion. Nothing is kept on our server.

### popup.html footer (line 178)

> Judgment starts on this device. Only if you turn on Glance's own model does a masked message go to our server, and nothing is kept there.

### Chrome Web Store data-usage text

> Message text is masked on the device before it is sent, and is sent only if the person turns on Glance's own model. It is not stored, sold, or used for training.

<div dir="rtl">

**מה אני אעשה אחרי «מאשר 2»:** אכניס את הנוסח לכל הקבצים בקומיט אחד, יחד עם חיבור המתג, כמו שדורש §6 במפרט. זה יהיה PR טיוטה בלי פריסה. הפריסה ל-Netlify מחכה ל«מאשר» נפרד, כמו היום.

## 3. תוויות batch-001 (בוטל 14/10)

**לא צריך לענות על הסעיף הזה.** ב-11/10 החלטת שאת לא מתייגת ידנית, וב-13/10 אישרת את מסלול A: תוויות מאומתות נוצרות מהפעולות שלך על הכרטיסים (אישור, עריכה, ביטול). הטבלה נשארת כאן לעיון בלבד. שאלה 3ב, הכלל על אישור סכום, עדיין פתוחה.

19 מיילים. 14 מהם עם תשובה ברורה, ו-5 מסומנים "תלוי הקשר", אז הם לא נספרים ואין צורך לענות עליהם. ההמלצה היא מה שה-CTO סימן ב-08/10. חשוב לדעת: לפי הכלל של המעבדה, תווית נחשבת "מאומתת ע״י הבעלים" רק אם את אישרת אותה. לכן אני לא יכול לסמן אותן בשמך.

| # | המייל | ההמלצה |
|---|---|---|
| 1 | בוקר טוב, יש מצב לחזור אליי עם ה-SOW עד מחר בבוקר? תודה רבה, אבי | **להציע: טיוטת תשובה** |
| 2 | יש מצב להעלות את טופס 101 למערכת מחר? | **להציע: טיוטת תשובה** |
| 3 | סאלי שלום, אשמח אם תכיני את ה-PO עד סוף היום בתודה, אבי | **להציע: טיוטת תשובה** |
| 4 | נשמח אם תוכלו לשלוח לי את תעודת ההתאגדות לפני החג? תודה! | **להציע: טיוטת תשובה** |
| 5 | היי, אפשר להעלות את החוזה החתום למערכת ביום שני? בתודה, שרה | **להציע: טיוטת תשובה** |
| 6 | ‏סאלי, תוכלי לעשות approve לקליטת העובד החדש עד ה-15.10? | **להציע: טיוטת תשובה** |
| 7 | Hello, Can I get the budget spreadsheet from you by Thursday? Best, Ethan | **להציע: טיוטת תשובה** |
| 8 | Hi all, Can you please approve onboarding asap? Best | **תלוי הקשר (לא נספר)** |
| 9 | As a reminder, you agreed to send the invoice by Friday, September 18. | **להציע: משימה עם תאריך** |
| 10 | בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00. | **לשתוק** |
| 11 | Confirming the fee is about $4,200. | **לשתוק** |
| 12 | שלום רב, אפשר לשלוח לי את ה-PO עד יום שני? תודה! שרה -- שרה מזרחי סמנכ״ל כספים | אקמי בע״מ 054-1071271 www.acme.co.il | **תלוי הקשר (לא נספר)** |
| 13 | היי מאיה, תוכלי לעבור על הדוח הרבעוני ולחזור אליי השבוע? המשך יום טוב, נועה -- נועה פרץ מנהלת לקוחות | נורת׳ווינד 054-1063352 www.acme.co.il | **תלוי הקשר (לא נספר)** |
| 14 | היי לכולם, אישרנו ₪89 עבור הקמפיין. יום נעים, הילה -- הילה שמש מנהלת לקוחות | נורת׳ווינד 054-1063352 www.acme.co.il | **תלוי הקשר (לא נספר)** |
| 15 | שלום, מצורף ה-deck לתיעוד, לא נדרשת פעולה. תודה רבה | **תלוי הקשר (לא נספר)** |
| 16 | ‏צהריים טובים, ‏אולי כדאי לשמור את המצורף בדרייב ‏בתודה, ‏שרה | **לשתוק** |
| 17 | תשמור את הקובץ המצורף ב-One Drive עד יום ראשון בברכה נשלח מה-iPhone שלי | **להציע: שמירת הקובץ ל-OneDrive** |
| 18 | As agreed, you will send the expense report by October 15. Best, Sali -- Sali Sapan Account Manager | Northwind +972-54-1079190 | **להציע: משימה עם תאריך** |
| 19 | Hi all, Can you set up a interview Sunday at 11:15? Regards, Michael [image: logo] Michael Ross Head of Ops | Acme Ltd +972-54-1095028 CONFIDENTIALITY… | **להציע: אירוע ביומן** |

**3ב: כלל אחד שסוגר 7 מתוך 13 המחלוקות בסבב 003.** כשמישהו כותב "אישרנו 4,200" או "התקציב אושר", בלי לבקש ממך שום דבר, ההמלצה היא לשתוק, כמו במייל 11. האפשרות השנייה: להציע משימה.

**מה אני אעשה אחרי «מאשר 3»:** אריץ `apply-owner-answers.cjs` עם `labeledBy: sali`. זה יעביר 14 תוויות ל"מאומת", מתוך 200 שצריך. אחר כך אכין סבב הבא של 20 מיילים מהמחלוקות, באותו פורמט.

</div>
