# Data dictionary / מילון נתונים

Glance closes open loops. Gmail is where it starts today.

Consent is required. Retention is 365 days. pii: none.

## English

| Field | Why | Never |
|---|---|---|
| `decision_id` | Random decision id. Not derived from content. | Mail text, names, addresses, message ids. |
| `policy_id` | Engine version and threshold, as a token. | Mail text, names, addresses, message ids. |
| `chosen_intent_type` | The type the policy chose, or empty. | Mail text, names, addresses, message ids. |
| `propensity` | 1 while the policy is deterministic. | Mail text, names, addresses, message ids. |
| `deterministic` | True while exploration is off. | Mail text, names, addresses, message ids. |
| `explore_epsilon` | Exploration rate. The writer forces 0. | Mail text, names, addresses, message ids. |
| `engine_feature_hash` | Hash of the policy token, not of mail. | Mail text, names, addresses, message ids. |
| `engine_version` | Version token. | Mail text, names, addresses, message ids. |
| `surface` | Surface token. | Mail text, names, addresses, message ids. |
| `local_day` | The person's local calendar day. | Mail text, names, addresses, message ids. |
| `tz_offset_bucket` | Whole-hour offset bucket, or unknown. | Mail text, names, addresses, message ids. |
| `weekday` | Local weekday. | Mail text, names, addresses, message ids. |
| `hour_bucket` | Six-hour local bucket. | Mail text, names, addresses, message ids. |
| `locale` | UI language bucket. | Mail text, names, addresses, message ids. |
| `candidates` | Up to five types, with a score quantized to 0.05. | Mail text, names, addresses, message ids. |
| `intent_type` | Intent type from the taxonomy. | Mail text, names, addresses, message ids. |
| `target_system` | System that received the close. | Mail text, names, addresses, message ids. |
| `confidence_bucket` | Confidence bucket. | Mail text, names, addresses, message ids. |
| `latency_ms` | Milliseconds, capped. | Mail text, names, addresses, message ids. |
| `negative` | Explicit negative feedback. Default false. | Mail text, names, addresses, message ids. |
| `specversion` | CloudEvents version. | Mail text, names, addresses, message ids. |
| `id` | Random UUIDv7. | Mail text, names, addresses, message ids. |
| `source` | Surface plus a random install id. | Mail text, names, addresses, message ids. |
| `type` | Event name. | Mail text, names, addresses, message ids. |
| `time` | Local time with a numeric offset. | Mail text, names, addresses, message ids. |
| `dataschema` | Schema URI. | Mail text, names, addresses, message ids. |
| `subject` | Random intent id. | Mail text, names, addresses, message ids. |
| `seq` | Monotonic counter per install. | Mail text, names, addresses, message ids. |

## עברית

| Field | Why | Never |
|---|---|---|
| `decision_id` | מזהה אקראי של ההחלטה. לא נגזר מתוכן. | Mail text, names, addresses, message ids. |
| `policy_id` | גרסת המנוע והסף, כסוג בלבד. | Mail text, names, addresses, message ids. |
| `chosen_intent_type` | הסוג שנבחר, או ריק. | Mail text, names, addresses, message ids. |
| `propensity` | 1 כשהמדיניות דטרמיניסטית. | Mail text, names, addresses, message ids. |
| `deterministic` | אמת כל עוד אין חקירה. | Mail text, names, addresses, message ids. |
| `explore_epsilon` | שיעור חקירה. הכותב כופה 0. | Mail text, names, addresses, message ids. |
| `engine_feature_hash` | גיבוב של אסימון המדיניות, לא של דואר. | Mail text, names, addresses, message ids. |
| `engine_version` | אסימון גרסה. | Mail text, names, addresses, message ids. |
| `surface` | המשטח. | Mail text, names, addresses, message ids. |
| `local_day` | היום המקומי של האדם. | Mail text, names, addresses, message ids. |
| `tz_offset_bucket` | דלי של שעת אזור, או לא ידוע. | Mail text, names, addresses, message ids. |
| `weekday` | יום בשבוע מקומי. | Mail text, names, addresses, message ids. |
| `hour_bucket` | דלי של שש שעות. | Mail text, names, addresses, message ids. |
| `locale` | דלי שפת ממשק. | Mail text, names, addresses, message ids. |
| `candidates` | עד חמישה סוגים, עם ציון מקוונט 0.05. | Mail text, names, addresses, message ids. |
| `intent_type` | סוג כוונה מהטקסונומיה. | Mail text, names, addresses, message ids. |
| `target_system` | המערכת שקיבלה את הסגירה. | Mail text, names, addresses, message ids. |
| `confidence_bucket` | דלי ביטחון. | Mail text, names, addresses, message ids. |
| `latency_ms` | מילישניות, עם תקרה. | Mail text, names, addresses, message ids. |
| `negative` | משוב שלילי מפורש. ברירת מחדל שקר. | Mail text, names, addresses, message ids. |
| `specversion` | גרסת CloudEvents. | Mail text, names, addresses, message ids. |
| `id` | מזהה UUIDv7 אקראי. | Mail text, names, addresses, message ids. |
| `source` | מקור: משטח ומזהה התקנה אקראי. | Mail text, names, addresses, message ids. |
| `type` | שם האירוע. | Mail text, names, addresses, message ids. |
| `time` | זמן מקומי עם היסט. | Mail text, names, addresses, message ids. |
| `dataschema` | כתובת הסכמה. | Mail text, names, addresses, message ids. |
| `subject` | מזהה הכוונה האקראי. | Mail text, names, addresses, message ids. |
| `seq` | מונה עולה לכל התקנה. | Mail text, names, addresses, message ids. |
