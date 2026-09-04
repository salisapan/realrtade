// Domain profiles — the "what kind of work" dimension of flexibility.
//
// A domain profile does NOT define trigger->action rules. It only biases the
// judgment engine's attention: which entities matter, which verbs count as a
// real event, and what language to use when it proposes an action. Adding a
// new line of work means adding a profile here — never asking the end user
// to author logic.
//
// judged() in judgment.js reads whichever profile the user picked at
// onboarding and uses it purely as context for the (future) model call.
// Everything under `demoTriggers` exists only so Phase 1 can render a
// realistic end-to-end chip without a live API key — it is replaced wholesale
// once judgment.js talks to a real model.

const FLOW_DOMAINS = [
  {
    id: 'sales',
    label: 'מכירות ופיתוח עסקי',
    entity: 'עסקה / לקוח',
    verbs: ['סגירת מחיר', 'שינוי היקף', 'תאריך חתימה', 'אובדן עסקה'],
    actionVerb: (ctx) => `עדכן שווי עסקה ל-${ctx.amount || '…'}`,
    demoTriggers: [
      { pattern: /(סגרנו|התחייבנו|אישרנו)[^.]{0,40}(\d[\d,]*\s?(₪|ש"ח|\$|usd))/i,
        buildAction: (m) => `עדכן שווי עסקה ל-${m[2]}` },
      { pattern: /(לא ממשיכים|ביטלנו|פרשנו מ)/i,
        buildAction: () => `סמן עסקה כאבודה` }
    ]
  },
  {
    id: 'legal',
    label: 'משפט ותיאום עסקאות',
    entity: 'תיק / הסכם',
    verbs: ['טיוטת הסכם', 'מועד הגשה', 'חתימה', 'תיקון סעיף'],
    actionVerb: (ctx) => `עדכן תאריך יעד בתיק ל-${ctx.date || '…'}`,
    demoTriggers: [
      { pattern: /(מועד הגשה|דדליין|יש להגיש עד)[^.]{0,30}(\d{1,2}[./]\d{1,2})/i,
        buildAction: (m) => `עדכן תאריך יעד בתיק ל-${m[2]}` },
      { pattern: /(נחתם|חתמנו על ההסכם)/i,
        buildAction: () => `סמן תיק כחתום` }
    ]
  },
  {
    id: 'finance',
    label: 'כספים ותפעול פיננסי',
    entity: 'חשבונית / ספק',
    verbs: ['חשבונית התקבלה', 'אי-התאמה בסכום', 'אישור תשלום'],
    actionVerb: (ctx) => `פתח חריגת תשלום — ${ctx.detail || 'אי-התאמה בסכום'}`,
    demoTriggers: [
      { pattern: /(חשבונית מס|invoice)[^.]{0,40}(\d[\d,]*\s?(₪|ש"ח|\$))/i,
        buildAction: (m) => `רשום חשבונית — ${m[2]}` },
      { pattern: /(הסכום לא תואם|טעות בחיוב|חיוב כפול)/i,
        buildAction: () => `פתח חריגת תשלום לבדיקה` }
    ]
  },
  {
    id: 'ops',
    label: 'תפעול ואדמיניסטרציה',
    entity: 'משימה / בקשה',
    verbs: ['בקשה חדשה', 'סטטוס השתנה', 'צריך מעקב'],
    actionVerb: () => `צור משימת מעקב`,
    demoTriggers: [
      { pattern: /(אנא טפל|בבקשה תעדכן|ממתין לתשובה)/i,
        buildAction: () => `צור משימת מעקב` }
    ]
  }
];

// Exposed for popup + content script (classic scripts share this global).
if (typeof module !== 'undefined') module.exports = { FLOW_DOMAINS };
