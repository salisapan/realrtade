// Connector catalog — the "which systems" dimension of flexibility.
//
// Picking a connector is a permission grant, never a rule. The user checks
// the boxes for systems they actually use; the same judgment engine (see
// judgment.js) runs unchanged regardless of which one is connected. Adding a
// new destination means adding an entry here plus its executeAction()
// implementation later — never a change to how detection works.
//
// `status: 'live' | 'building' | 'planned'` drives what the popup shows so we
// never claim a connector works before its OAuth + write path actually exist.

const FLOW_CONNECTORS = [
  {
    id: 'hubspot',
    label: 'HubSpot',
    kind: 'CRM',
    status: 'building',
    note: 'המחבר הראשון בבנייה — הפעולה הקנונית: עדכון שווי עסקה / יצירת ליד.'
  },
  {
    id: 'monday',
    label: 'Monday.com',
    kind: 'ניהול עבודה',
    status: 'planned'
  },
  {
    id: 'notion',
    label: 'Notion',
    kind: 'מסמכים / בסיס נתונים',
    status: 'planned'
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    kind: 'CRM',
    status: 'planned'
  },
  {
    id: 'pipedrive',
    label: 'Pipedrive',
    kind: 'CRM',
    status: 'planned'
  },
  {
    id: 'demo',
    label: 'יעד הדגמה מקומי',
    kind: 'לבדיקה בלבד',
    status: 'live',
    note: 'לא כותב לשום מערכת אמיתית — משמש לבדוק את חוויית הכפתור מקצה לקצה לפני שיש מחבר חי.'
  }
];

if (typeof module !== 'undefined') module.exports = { FLOW_CONNECTORS };
