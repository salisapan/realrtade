# Closed-intent ledger / יומן סגירות

Glance closes open loops. Gmail is where it starts today.

This is a consented record of what actually got done. It is not a copy of the mail. Flow templates and Flow Shadow can read the same types later from `closed-intent-ledger.schema.json` (version 1). Nothing here is uploaded.

## English

**What a record holds.** Intent type (`send_quote`, `create_event`, `create_task`, `draft_reply`, `create_document`, `save_file`, or `other`), surface (`gmail`, `outlook`, `teams`, and the other names in the schema), target system (`calendar`, `drive`, `onedrive`, `todo`, `tasks`, `drafts`, `docs`, `sheets`, `teams`, or `other`), outcome (`closed`, `undone`, or `failed`), confidence bucket (`high`, `medium`, `low`, `unknown`), latency in milliseconds, schema version, and the UTC day (`YYYY-MM-DD`).

**What a record never holds.** Mail text, subjects, names, addresses, message ids, thread ids, or any other content. A value that is not on the allowlist is dropped. A proved Do It (`fetchedBack`) appends `closed`. An Undo appends a second row with outcome `undone`. The earlier row stays, because the ledger has no id to rewrite it. A write that came back unproved appends `failed`. Shown, clicked, and dismissed rows are not records.

**Consent.** Off until the person turns it on in Settings. The default is off. Turning it off stops new records immediately. Rows already stored stay until Delete all.

**Export and delete.** Both run on this device. Export downloads one JSON file. Delete all clears the rows and leaves the on/off choice as it is. Neither one uses the network.

**Aggregate sync.** Disabled. There is no endpoint and no request. See the TODO in `closed-intent-ledger.js`. A future sync, if the owner approves it, may send counts of these types only, and only after a separate consent.

The list is capped at 500 rows, newest kept. Storage is the host's (extension storage today). The module itself does not choose a browser API.

## עברית

**מה רשומה מכילה.** סוג כוונה (`send_quote`, `create_event`, `create_task`, `draft_reply`, `create_document`, `save_file`, או `other`), משטח (`gmail`, `outlook`, `teams`, ושאר השמות בסכמה), מערכת יעד (`calendar`, `drive`, `onedrive`, `todo`, `tasks`, `drafts`, `docs`, `sheets`, `teams`, או `other`), תוצאה (`closed`, `undone`, או `failed`), דלי ביטחון (`high`, `medium`, `low`, `unknown`), זמן המתנה במילישניות, גרסת סכמה, והיום לפי UTC (`YYYY-MM-DD`).

**מה רשומה לא מכילה.** טקסט של דואר, נושא, שם, כתובת, מזהה הודעה, מזהה שרשור, או כל תוכן אחר. ערך שאינו ברשימה המותרת נזרק. סגירה שהוכחה (`fetchedBack`) מוסיפה `closed`. ביטול מוסיף שורה שנייה עם תוצאה `undone`. השורה הקודמת נשארת, כי ליומן אין מזהה שאפשר לכתוב עליו מחדש. כתיבה שלא הוכחה מוסיפה `failed`. שורות של הצגה, לחיצה או הסתרה אינן רשומות.

**הסכמה.** כבוי עד שהאדם מדליק בהגדרות. ברירת המחדל כבויה. כיבוי עוצר רשומות חדשות מיד. מה שכבר נשמר נשאר עד למחיקה.

**ייצוא ומחיקה.** שניהם רצים על המכשיר. ייצוא מוריד קובץ JSON אחד. מחיקה מוחקת את השורות ומשאירה את הבחירה דלוק או כבוי. אף אחד מהם לא משתמש ברשת.

**סנכרון מצטבר.** כבוי. אין כתובת ואין בקשה. ראו את ההערה בקובץ `closed-intent-ledger.js`. סנכרון עתידי, אם הבעלים יאשרו, יוכל לשלוח רק ספירות של הסוגים האלה, ורק אחרי הסכמה נפרדת.

הרשימה חסומה ב-500 שורות, והחדשות נשמרות. האחסון הוא של המארח (אחסון ההרחבה היום). המודול עצמו לא בוחר ממשק של דפדפן.
