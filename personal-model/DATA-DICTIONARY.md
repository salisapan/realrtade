# Data dictionary / מילון נתונים

Glance closes open loops. Gmail is where it starts today.

The personal model is on this computer. Consent is off until the person turns a category on. A user-confirmed fact has confidence 1 and does not decay.

Tie strength = 0.45 recency + 0.35 frequency + 0.20 reciprocity. Recency half-life is 30 days. Frequency caps at 20 observations.

## English

| Field | Why | Category | PII | Half-life days | Third party |
|---|---|---|---|---|---|
| `fact.id` | Random id. Not derived from mail. | identity | none | 0 | false |
| `fact.subject_id` | The entity this fact is about. | people | none | 0 | true |
| `fact.predicate` | Controlled predicate token. | identity | none | 0 | true |
| `fact.object` | Short object token. Never a mail body. | identity | indirect | 30 | true |
| `fact.source` | observed or inferred or user_stated. | identity | none | 0 | true |
| `fact.confidence` | Score from 0 to 1. User-confirmed facts stay at 1. | identity | none | 30 | true |
| `fact.valid_from` | When this value became true. | identity | none | 0 | true |
| `fact.valid_to` | When this value stopped being current. Empty while current. | identity | none | 0 | true |
| `fact.learned_at` | When Glance recorded the row. | identity | none | 0 | true |
| `fact.retired_at` | When the row was invalidated. Empty while current. | identity | none | 0 | true |
| `fact.consent_category` | Which consent gate allows this row. | identity | none | 0 | true |
| `fact.schema_ver` | Schema version token. | identity | none | 0 | false |
| `fact.provenance` | user_said, user_sent, user_action, or third_party_content. | identity | none | 0 | true |
| `fact.status` | active or candidate. A candidate is not used until the person confirms it. | identity | none | 0 | true |
| `fact.memory_space` | work, personal, or client and an id. | work | none | 0 | false |
| `fact.context_of_origin` | Where the fact was learned. | identity | none | 0 | true |
| `fact.importance` | Normalized importance for retrieval. | identity | none | 30 | true |
| `evidence.surface` | gmail outlook or calendar. | people | none | 0 | true |
| `evidence.message_or_event_id` | Opaque id. Not a body and not an address. | people | indirect | 0 | true |
| `evidence.ts` | When that message or event happened. | people | none | 0 | true |
| `evidence.span_start` | Start offset of the cited span. The characters are not stored. | work | none | 0 | false |
| `evidence.span_end` | End offset of the cited span. The characters are not stored. | work | none | 0 | false |
| `entity.id` | Random entity id. | people | none | 0 | true |
| `entity.kind` | user or person. | people | none | 0 | true |
| `entity.canonical_email` | Lower-case address. Encrypted in IndexedDB. | people | direct | 0 | true |
| `alias.id` | Random alias id. | people | none | 0 | true |
| `alias.subject_id` | Entity this alias names. | people | none | 0 | true |
| `alias.alias` | Hebrew or Latin display name. Encrypted at rest. | people | direct | 0 | true |
| `alias.lang` | he en or other. | people | none | 0 | true |
| `consent.category` | people habits style work places or identity. | identity | none | 0 | false |
| `consent.enabled` | False until the disclosure is accepted. | identity | none | 0 | false |
| `consent.granted_at` | When the person accepted. Empty while off. | identity | none | 0 | false |
| `tombstone.id` | Random tombstone id. | identity | none | 0 | true |
| `tombstone.key_hash` | Hash of the forgotten key. Not the key itself. | identity | none | 0 | true |
| `tombstone.predicate` | Predicate that must not be relearned. | identity | none | 0 | true |
| `tombstone.created_at` | When the person forgot this. | identity | none | 0 | true |
| `exemplar.id` | Random exemplar id. | style | none | 0 | false |
| `exemplar.audience` | client colleague family or unknown. | style | none | 0 | false |
| `exemplar.lang` | he en or mixed. | style | none | 0 | false |
| `exemplar.snippet` | Scrubbed text from the user's own send. Addresses and phones removed. Encrypted. | style | indirect | 90 | false |
| `exemplar.greeting` | Greeting enum. | style | none | 90 | false |
| `exemplar.signoff` | Sign-off enum. | style | none | 90 | false |
| `style_rule.id` | Random rule id. | style | none | 0 | false |
| `style_rule.audience` | Who the rule is for. | style | none | 0 | false |
| `style_rule.lang` | Language the rule applies to. | style | none | 0 | false |
| `style_rule.greeting` | Greeting the person chose. | style | none | 0 | false |
| `style_rule.signoff` | Sign-off the person chose. | style | none | 0 | false |
| `style_rule.formality` | casual neutral or formal. | style | none | 0 | false |
| `review.id` | Random review id. | people | none | 0 | true |
| `review.left_id` | First entity id. | people | none | 0 | true |
| `review.right_id` | Second entity id. | people | none | 0 | true |
| `review.reason` | Why Glance did not merge. | people | none | 0 | true |
| `review.status` | pending merged or denied. | people | none | 0 | true |

## עברית

| Field | Why | Category | PII | Half-life days | Third party |
|---|---|---|---|---|---|
| `fact.id` | מזהה אקראי. לא נגזר מדואר. | identity | none | 0 | false |
| `fact.subject_id` | הישות שהעובדה עליה. | people | none | 0 | true |
| `fact.predicate` | פרדיקט מאוצר מילים סגור. | identity | none | 0 | true |
| `fact.object` | אובייקט קצר. אף פעם לא גוף דואר. | identity | indirect | 30 | true |
| `fact.source` | נצפה או הוסק או נאמר על ידי האדם. | identity | none | 0 | true |
| `fact.confidence` | ציון מ-0 עד 1. עובדה שאושרה נשארת 1. | identity | none | 30 | true |
| `fact.valid_from` | מתי הערך הזה נעשה נכון. | identity | none | 0 | true |
| `fact.valid_to` | מתי הערך חדל להיות עדכני. ריק כל עוד הוא עדכני. | identity | none | 0 | true |
| `fact.learned_at` | מתי Glance רשם את השורה. | identity | none | 0 | true |
| `fact.retired_at` | מתי השורה בוטלה. ריק כל עוד היא עדכנית. | identity | none | 0 | true |
| `fact.consent_category` | איזה שער הסכמה מתיר את השורה. | identity | none | 0 | true |
| `fact.schema_ver` | אסימון גרסת סכמה. | identity | none | 0 | false |
| `fact.provenance` | נאמר, נשלח, פעולה, או תוכן של צד שלישי. | identity | none | 0 | true |
| `fact.status` | פעיל או מועמד. מועמד לא בשימוש עד אישור. | identity | none | 0 | true |
| `fact.memory_space` | עבודה, אישי, או לקוח ומזהה. | work | none | 0 | false |
| `fact.context_of_origin` | איפה העובדה נלמדה. | identity | none | 0 | true |
| `fact.importance` | חשיבות מנורמלת לשליפה. | identity | none | 30 | true |
| `evidence.surface` | גימייל אאוטלוק או יומן. | people | none | 0 | true |
| `evidence.message_or_event_id` | מזהה אטום. לא גוף ולא כתובת. | people | indirect | 0 | true |
| `evidence.ts` | מתי ההודעה או האירוע קרו. | people | none | 0 | true |
| `evidence.span_start` | תחילת הטווח המצוטט. התווים עצמם לא נשמרים. | work | none | 0 | false |
| `evidence.span_end` | סוף הטווח המצוטט. התווים עצמם לא נשמרים. | work | none | 0 | false |
| `entity.id` | מזהה ישות אקראי. | people | none | 0 | true |
| `entity.kind` | משתמש או אדם. | people | none | 0 | true |
| `entity.canonical_email` | כתובת באותיות קטנות. מוצפנת ב-IndexedDB. | people | direct | 0 | true |
| `alias.id` | מזהה כינוי אקראי. | people | none | 0 | true |
| `alias.subject_id` | הישות שהכינוי שייך לה. | people | none | 0 | true |
| `alias.alias` | שם תצוגה בעברית או בלטינית. מוצפן במנוחה. | people | direct | 0 | true |
| `alias.lang` | עברית אנגלית או אחר. | people | none | 0 | true |
| `consent.category` | אנשים הרגלים סגנון עבודה מקומות או זהות. | identity | none | 0 | false |
| `consent.enabled` | שקר עד שהגילוי מאושר. | identity | none | 0 | false |
| `consent.granted_at` | מתי האדם אישר. ריק כל עוד כבוי. | identity | none | 0 | false |
| `tombstone.id` | מזהה מחיקה אקראי. | identity | none | 0 | true |
| `tombstone.key_hash` | גיבוב של המפתח שנשכח. לא המפתח עצמו. | identity | none | 0 | true |
| `tombstone.predicate` | הפרדיקט שאסור ללמוד שוב. | identity | none | 0 | true |
| `tombstone.created_at` | מתי האדם שכח את זה. | identity | none | 0 | true |
| `exemplar.id` | מזהה דוגמה אקראי. | style | none | 0 | false |
| `exemplar.audience` | לקוח עמית משפחה או לא ידוע. | style | none | 0 | false |
| `exemplar.lang` | עברית אנגלית או מעורב. | style | none | 0 | false |
| `exemplar.snippet` | טקסט מנוקה משליחה של האדם. כתובות וטלפונים הוסרו. מוצפן. | style | indirect | 90 | false |
| `exemplar.greeting` | סוג פתיח. | style | none | 90 | false |
| `exemplar.signoff` | סוג חתימה. | style | none | 90 | false |
| `style_rule.id` | מזהה כלל אקראי. | style | none | 0 | false |
| `style_rule.audience` | למי הכלל. | style | none | 0 | false |
| `style_rule.lang` | השפה שהכלל חל עליה. | style | none | 0 | false |
| `style_rule.greeting` | הפתיח שהאדם בחר. | style | none | 0 | false |
| `style_rule.signoff` | החתימה שהאדם בחר. | style | none | 0 | false |
| `style_rule.formality` | יומיומי ניטרלי או רשמי. | style | none | 0 | false |
| `review.id` | מזהה ביקורת אקראי. | people | none | 0 | true |
| `review.left_id` | מזהה הישות הראשונה. | people | none | 0 | true |
| `review.right_id` | מזהה הישות השנייה. | people | none | 0 | true |
| `review.reason` | למה Glance לא מיזג. | people | none | 0 | true |
| `review.status` | ממתין מוזג או נדחה. | people | none | 0 | true |
