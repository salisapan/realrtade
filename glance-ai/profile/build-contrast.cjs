'use strict';
// Synthetic contrast pairs. Same email, two profiles, two correct actions.
// labeledBy is synthetic-contrast. Nothing here is an owner label.
const fs = require('fs');
const path = require('path');

const GMAIL = 'ai.local.flow@gmail.com';
const OLK = 'glance.salisapan@outlook.com';
const OUT = path.join(__dirname, '..', 'labeling', 'contrast-v0.jsonl');

function prof(id, extra) {
  extra = extra || {};
  return {
    schemaVersion: 'user-context-v0',
    userId: id,
    trainingConsent: false,
    identity: Object.assign({
      aliases: ['Sali', 'Sali Sapan', 'סאלי'],
      title: '',
      department: '',
      manager: null,
      groups: [],
      reports: []
    }, extra.identity || {}),
    relationships: extra.relationships || [],
    decisionHistory: extra.decisionHistory || [],
    workStyle: Object.assign({
      hours: { start: '09:00', end: '18:00', timezone: 'Asia/Jerusalem' },
      languages: ['he', 'en'],
      preferredTools: { files: extra.files || 'drive', tasks: 'tasks' },
      savesFiles: 'unknown',
      answersGroupMailRate: null
    }, extra.workStyle || {}),
    preferences: extra.preferences || []
  };
}

function approver(id, topics) {
  return prof(id, { identity: { groups: [{ address: 'approvals@acme.co', role: 'approver', topics: topics }] } });
}
function member(id) {
  return prof(id, {
    identity: { groups: [{ address: 'all@acme.co', role: 'member', topics: [] }] },
    workStyle: { answersGroupMailRate: 0 }
  });
}
function rel(key, replyRate, seen) {
  return { key: key, kind: 'sender', replyCount: Math.round(replyRate * seen), seenCount: seen, replyRate: replyRate, medianLatencyHours: 5, answersGroupMail: null };
}
function hist(family, party, counts) {
  return Object.assign({
    intentFamily: family, party: party, approvedFetchedBack: 0, dismissed: 0, undo: 0, edited: 0, missedClose: 0,
    lastAt: '2026-10-01T09:00:00.000Z'
  }, counts);
}

function pair(spec) {
  const email = {
    surface: spec.surface || 'gmail',
    direction: 'inbound',
    attachmentCount: spec.attachmentCount || 0,
    to: spec.to,
    cc: spec.cc || [],
    from: spec.from,
    subject: spec.subject,
    body: spec.body
  };
  return ['A', 'B'].map((side) => {
    const gold = spec[side];
    return Object.assign({
      id: 'contrast-' + spec.id + '-' + side.toLowerCase(),
      pairId: spec.id,
      side: side,
      synthetic: true,
      labeledBy: 'synthetic-contrast',
      ownerVerified: false,
      consent: false,
      lang: spec.lang,
      scenario: spec.scenario,
      depends_on: spec.depends_on,
      profile: gold.profile,
      goldAction: gold.action,
      goldRelevance: gold.relevance
    }, email);
  });
}

function lines() {
  const P = [];
  const add = (s) => { for (const row of pair(s)) P.push(row); };
  const toG = [GMAIL];
  const toO = [OLK];

  add({ id: 'g01', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Onboarding',
    from: { name: 'Tom Baker', email: 'tom@acme.co' }, to: toG,
    body: 'Hi all,\n\nCan you please approve onboarding asap?\n\nBest,\nTom',
    A: { profile: approver('g01a', ['onboarding']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('g01b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'g02', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Contract',
    from: { name: 'Sarah Cohen', email: 'sarah@acme.co' }, to: toG,
    body: 'Hi team,\n\nCould you review the contract by Friday?\n\nBest,\nSarah',
    A: { profile: member('g02a'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('g02b', ['contract']), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'g03', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'PO',
    from: { name: 'Ethan', email: 'ethan@acme.co' }, to: toG,
    body: 'Hi everyone,\n\nCan someone send the PO today?\n\nThanks,\nEthan',
    A: { profile: approver('g03a', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('g03b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'g04', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'New hire',
    from: { name: 'Mia', email: 'mia@acme.co' }, to: toG,
    body: 'Hi all,\n\nPlease approve the new hire by Monday.\n\nBest,\nMia',
    A: { profile: approver('g04a', ['onboarding']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('g04b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'g05', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'קליטה',
    from: { name: 'אבי', email: 'avi@acme.co' }, to: toG,
    body: 'היי לכולם,\n\nנא לאשר את קליטת העובד עד מחר.\n\nתודה,\nאבי',
    A: { profile: approver('g05a', ['onboarding']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('g05b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'g06', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'הזמנה',
    from: { name: 'שרה', email: 'sara@acme.co' }, to: toG,
    body: 'היי צוות,\n\nאפשר לאשר את ההזמנה עד מחר?\n\nבתודה,\nשרה',
    A: { profile: member('g06a'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('g06b', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'g07', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'דירקטוריון',
    from: { name: 'מיכאל', email: 'michael@acme.co' }, to: toG,
    body: 'שלום לכולם,\n\nבבקשה מלאו את תזכיר הדירקטוריון היום.\n\nתודה,\nמיכאל',
    A: { profile: approver('g07a', ['board']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('g07b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'g08', lang: 'he', scenario: 'group-approver', depends_on: 'role_matches_topic', subject: 'אושר',
    from: { name: 'הילה', email: 'hila@acme.co' }, to: toO, surface: 'outlook',
    body: 'היי לכולם,\n\nאישרנו ₪89 עבור הקמפיין.\n\nיום נעים,\nהילה',
    A: { profile: prof('g08a', { identity: { department: 'כספים', title: 'סמנכ״ל כספים' } }), action: 'confirmed-amount|task', relevance: 'relevant' },
    B: { profile: prof('g08b', { identity: { department: 'Engineering', title: 'Engineer' }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });

  add({ id: 'a01', lang: 'en', scenario: 'addressed-other', depends_on: 'covers_addressee', subject: 'Quarterly report',
    from: { name: 'Noa', email: 'noa@acme.co' }, to: toG,
    body: 'Hi Maya,\n\nCan you review the quarterly report this week?\n\nThanks,\nNoa',
    A: { profile: prof('a01a', { identity: { reports: [{ name: 'Maya', email: 'maya@acme.co' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a01b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'a02', lang: 'en', scenario: 'addressed-other', depends_on: 'named_addressee', subject: 'Contract',
    from: { name: 'Lior', email: 'lior@acme.co' }, to: toG,
    body: 'Dana, please send the contract by Monday.',
    A: { profile: prof('a02a', { identity: { aliases: ['Dana', 'Dana Levi'] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a02b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'a03', lang: 'he', scenario: 'addressed-other', depends_on: 'covers_addressee', subject: 'דוח',
    from: { name: 'נועה', email: 'noa@acme.co' }, to: toO, surface: 'outlook',
    body: 'היי מאיה,\n\nתוכלי לעבור על הדוח הרבעוני השבוע?\n\nתודה,\nנועה',
    A: { profile: prof('a03a', { identity: { reports: [{ name: 'מאיה', email: 'maya@acme.co' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a03b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'a04', lang: 'he', scenario: 'addressed-other', depends_on: 'named_addressee', subject: 'חוזה',
    from: { name: 'יוסי', email: 'yossi@acme.co' }, to: toG,
    body: 'דנה, בבקשה שלחי את החוזה עד יום שני.',
    A: { profile: prof('a04a', { identity: { aliases: ['דנה', 'דנה לוי'] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a04b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'a05', lang: 'en', scenario: 'addressed-other', depends_on: 'covers_addressee', subject: 'PO',
    from: { name: 'Ron', email: 'ron@acme.co' }, to: toG,
    body: 'Hi Tom,\n\nPlease approve the PO by Thursday.\n\nThanks,\nRon',
    A: { profile: prof('a05a', { identity: { reports: [{ name: 'Tom', email: 'tom@acme.co' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a05b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'a06', lang: 'he', scenario: 'addressed-other', depends_on: 'covers_addressee', subject: 'חשבונית',
    from: { name: 'אבי', email: 'avi@acme.co' }, to: toG,
    body: 'היי נועה,\n\nאפשר לאשר את החשבונית השבוע?\n\nתודה,\nאבי',
    A: { profile: prof('a06a', { identity: { reports: [{ name: 'נועה', email: 'noa.report@acme.co' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('a06b'), action: 'SILENT', relevance: 'not_relevant' } });

  const ccTo = ['colleague5@northwind.co.il'];
  add({ id: 'c01', lang: 'en', scenario: 'cc-only', depends_on: 'cc_reply_rate', subject: 'PO',
    from: { name: 'Sarah', email: 'sarah.cc@acme.co' }, to: ccTo, cc: [GMAIL],
    body: 'Please send the PO by Monday.\n\nThanks,\nSarah',
    A: { profile: prof('c01a', { relationships: [rel('sarah.cc@acme.co', 0.8, 6)] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c01b', { relationships: [rel('sarah.cc@acme.co', 0, 6)] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'c02', lang: 'en', scenario: 'cc-only', depends_on: 'user_is_approver_for', subject: 'Agreement',
    from: { name: 'Ben', email: 'ben@acme.co' }, to: ccTo, cc: [GMAIL],
    body: 'Can you sign the agreement by Monday?\n\nBest,\nBen',
    A: { profile: approver('c02a', ['contract']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c02b', { relationships: [rel('ben@acme.co', 0, 4)] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'c03', lang: 'he', scenario: 'cc-only', depends_on: 'user_is_approver_for', subject: 'PO',
    from: { name: 'שרה', email: 'sara.cc@acme.co' }, to: ccTo, cc: [GMAIL],
    body: 'אפשר לשלוח את ה-PO עד יום שני?\n\nתודה,\nשרה',
    A: { profile: approver('c03a', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c03b', { relationships: [rel('sara.cc@acme.co', 0, 3)] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'c04', lang: 'he', scenario: 'cc-only', depends_on: 'history_closed', subject: 'התאגדות',
    from: { name: 'נועה', email: 'noa.cc@acme.co' }, to: ccTo, cc: [GMAIL],
    body: 'בבקשה תשלחי את תעודת ההתאגדות לפני החג.\n\nתודה,\nנועה',
    A: { profile: prof('c04a', { decisionHistory: [hist('follow-up-ask', 'noa.cc@acme.co', { approvedFetchedBack: 3 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c04b', { decisionHistory: [hist('follow-up-ask', 'noa.cc@acme.co', { dismissed: 3 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'c05', lang: 'en', scenario: 'cc-only', depends_on: 'history_closed', subject: 'Invoice',
    from: { name: 'Billing', email: 'billing@vendor.example' }, to: ccTo, cc: [GMAIL],
    body: 'Please confirm this month\'s invoice by Friday.\n\nBilling',
    A: { profile: prof('c05a', { decisionHistory: [hist('follow-up-ask', 'billing@vendor.example', { approvedFetchedBack: 4 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c05b', { decisionHistory: [hist('follow-up-ask', 'billing@vendor.example', { dismissed: 4 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'c06', lang: 'he', scenario: 'cc-only', depends_on: 'user_is_approver_for', subject: 'חשבונית',
    from: { name: 'מיכאל', email: 'michael.cc@acme.co' }, to: ccTo, cc: [OLK], surface: 'outlook',
    body: 'נא לאשר את החשבונית עד מחר.\n\nתודה,\nמיכאל',
    A: { profile: approver('c06a', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('c06b', { relationships: [rel('michael.cc@acme.co', 0, 5)] }), action: 'SILENT', relevance: 'not_relevant' } });

  add({ id: 'f01', lang: 'en', scenario: 'fyi', depends_on: 'work_style.files', subject: 'Q3 deck',
    from: { name: 'Mia', email: 'mia.fyi@acme.co' }, to: toG, attachmentCount: 1,
    body: 'Attached the Q3 deck for your files.\n\nMia',
    A: { profile: prof('f01a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('f01b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'f02', lang: 'he', scenario: 'fyi', depends_on: 'work_style.files', subject: 'לידיעתך',
    from: { name: 'מיכאל', email: 'michael.fyi@acme.co' }, to: toO, surface: 'outlook', attachmentCount: 1,
    body: 'שלום, מצורף ה-deck לתיעוד, לא נדרשת פעולה.\n\nתודה,\nמיכאל',
    A: { profile: prof('f02a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('f02b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'f03', lang: 'en', scenario: 'fyi', depends_on: 'work_style.files', subject: 'Signed contract',
    from: { name: 'Legal', email: 'legal@acme.co' }, to: toG, attachmentCount: 1,
    body: 'The signed contract is attached for your records.\n\nLegal',
    A: { profile: prof('f03a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('f03b', { preferences: [{ key: 'fyi', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'f04', lang: 'he', scenario: 'fyi', depends_on: 'work_style.files', subject: 'סיכום',
    from: { name: 'הילה', email: 'hila.fyi@acme.co' }, to: toO, surface: 'outlook', attachmentCount: 1,
    body: 'לידיעתך, מצורף הסיכום לשמירה.\n\nהילה',
    A: { profile: prof('f04a', { workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('f04b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });

  add({ id: 'v01', lang: 'en', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'Monthly invoice',
    from: { name: 'Northwind Billing', email: 'billing@northwind.example' }, to: toG,
    body: 'Please confirm the monthly invoice by Friday.\n\nNorthwind Billing',
    A: { profile: prof('v01a', { decisionHistory: [hist('follow-up-ask', 'billing@northwind.example', { approvedFetchedBack: 4 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('v01b', { decisionHistory: [hist('follow-up-ask', 'billing@northwind.example', { dismissed: 4 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'v02', lang: 'en', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'Receipt',
    from: { name: 'Northwind Billing', email: 'billing@northwind.example' }, to: toG,
    body: 'Could you send the receipt for invoice 1842?\n\nThanks',
    A: { profile: prof('v02a', { decisionHistory: [hist('follow-up-ask', 'billing@northwind.example', { approvedFetchedBack: 2 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('v02b', { decisionHistory: [hist('follow-up-ask', 'billing@northwind.example', { undo: 2 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'v03', lang: 'he', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'חשבונית חודשית',
    from: { name: 'הנהלת חשבונות', email: 'accounts@vendor.example' }, to: toG,
    body: 'אפשר לאשר את החשבונית החודשית עד יום ראשון?\n\nתודה',
    A: { profile: prof('v03a', { decisionHistory: [hist('follow-up-ask', 'accounts@vendor.example', { approvedFetchedBack: 5 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('v03b', { decisionHistory: [hist('follow-up-ask', 'accounts@vendor.example', { dismissed: 5 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'v04', lang: 'he', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'אישור תשלום',
    from: { name: 'הנהלת חשבונות', email: 'accounts@vendor.example' }, to: toG,
    body: 'בבקשה שלחו את אישור התשלום עד מחר.\n\nתודה',
    A: { profile: prof('v04a', { decisionHistory: [hist('follow-up-ask', 'accounts@vendor.example', { approvedFetchedBack: 3 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('v04b', { decisionHistory: [hist('follow-up-ask', 'accounts@vendor.example', { dismissed: 2, undo: 1 })] }), action: 'SILENT', relevance: 'not_relevant' } });

  const rina = { name: 'Rina Levi', email: 'rina@acme.co' };
  add({ id: 'm01', lang: 'en', scenario: 'manager-team', depends_on: 'manager_request', subject: 'Status',
    from: rina, to: toG,
    body: 'Hi team,\n\nPlease send me the status by the end of the day.\n\nRina',
    A: { profile: prof('m01a', { identity: { manager: { name: 'Rina Levi', email: 'rina@acme.co' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('m01b', { identity: { manager: { name: 'Other Lead', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'm02', lang: 'en', scenario: 'manager-team', depends_on: 'manager_request', subject: 'Thursday',
    from: rina, to: toG,
    body: 'Hi all,\n\nCan we meet Thursday at 15:00 to review the plan?\n\nRina',
    A: { profile: prof('m02a', { identity: { manager: { name: 'Rina Levi', email: 'rina@acme.co' } } }), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('m02b', { identity: { manager: { name: 'Other Lead', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'm03', lang: 'he', scenario: 'manager-team', depends_on: 'manager_request', subject: 'סטטוס',
    from: { name: 'רינה לוי', email: 'rina@acme.co' }, to: toG,
    body: 'היי לכולם,\n\nנא לשלוח לי את הסטטוס עד סוף היום.\n\nרינה',
    A: { profile: prof('m03a', { identity: { manager: { name: 'רינה לוי', email: 'rina@acme.co' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('m03b', { identity: { manager: { name: 'מנהל אחר', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'm04', lang: 'he', scenario: 'manager-team', depends_on: 'manager_request', subject: 'ישיבה',
    from: { name: 'רינה לוי', email: 'rina@acme.co' }, to: toG,
    body: 'היי צוות,\n\nאפשר לאשר את הישיבה מחר בשעה 15:00?\n\nרינה',
    A: { profile: prof('m04a', { identity: { manager: { name: 'רינה לוי', email: 'rina@acme.co' } } }), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('m04b', { identity: { manager: { name: 'מנהל אחר', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'm05', lang: 'en', scenario: 'manager-team', depends_on: 'manager_request', subject: 'Board memo',
    from: rina, to: toG,
    body: 'Hi team,\n\nCould you approve the board memo today?\n\nRina',
    A: { profile: prof('m05a', { identity: { manager: { name: 'Rina Levi', email: 'rina@acme.co' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('m05b', { identity: { manager: { name: 'Other Lead', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'm06', lang: 'he', scenario: 'manager-team', depends_on: 'manager_request', subject: 'תקציב',
    from: { name: 'רינה לוי', email: 'rina@acme.co' }, to: toG,
    body: 'שלום לכולם,\n\nבבקשה תאשרו את התקציב עד יום חמישי.\n\nרינה',
    A: { profile: prof('m06a', { identity: { manager: { name: 'מנהל אחר', email: 'other@acme.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('m06b', { identity: { manager: { name: 'רינה לוי', email: 'rina@acme.co' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  add({ id: 's01', lang: 'en', scenario: 'save-file', depends_on: 'work_style.files', subject: 'File',
    from: { name: 'Dana', email: 'dana.files@acme.co' }, to: toG, attachmentCount: 1,
    body: 'Please save the attached file to Drive.\n\nDana',
    A: { profile: prof('s01a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s01b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 's02', lang: 'en', scenario: 'save-file', depends_on: 'work_style.files', subject: 'OneDrive',
    from: { name: 'Dana', email: 'dana.files@acme.co' }, to: toO, surface: 'outlook', attachmentCount: 1,
    body: 'Please save the attached file to OneDrive.\n\nDana',
    A: { profile: prof('s02a', { workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s02b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 's03', lang: 'he', scenario: 'save-file', depends_on: 'work_style.files', subject: 'דרייב',
    from: { name: 'שרה', email: 'sara.files@acme.co' }, to: toG, attachmentCount: 1,
    body: 'בבקשה שמרי את המצורף בדרייב.\n\nשרה',
    A: { profile: prof('s03a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s03b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 's04', lang: 'he', scenario: 'save-file', depends_on: 'work_style.files', subject: 'וואן דרייב',
    from: { name: 'יוסי', email: 'yossi.files@acme.co' }, to: toO, surface: 'outlook', attachmentCount: 1,
    body: 'אפשר לשמור את הקובץ בוואן דרייב?\n\nיוסי',
    A: { profile: prof('s04a', { workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s04b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 's05', lang: 'en', scenario: 'save-file', depends_on: 'history_closed', subject: 'Invoice file',
    from: { name: 'Dana', email: 'dana.files@acme.co' }, to: toG, attachmentCount: 1,
    body: 'Please file this invoice in Drive.\n\nDana',
    A: { profile: prof('s05a', { decisionHistory: [hist('file_save', 'dana.files@acme.co', { approvedFetchedBack: 3 })] }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s05b', { decisionHistory: [hist('file_save', 'dana.files@acme.co', { undo: 3 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 's06', lang: 'he', scenario: 'save-file', depends_on: 'explicit_preference', subject: 'קובץ',
    from: { name: 'נועה', email: 'noa.files@acme.co' }, to: toG, attachmentCount: 1,
    body: 'בבקשה שמור את המצורף.\n\nנועה',
    A: { profile: prof('s06a', { preferences: [{ key: 'save', value: 'offer' }] }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('s06b', { preferences: [{ key: 'save', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' } });

  return P;
}

function write() {
  const rows = lines();
  fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return rows;
}

module.exports = { lines, write, OUT };

if (require.main === module) {
  const rows = write();
  const pairs = new Set(rows.map((r) => r.pairId));
  console.log(JSON.stringify({ lines: rows.length, pairs: pairs.size, out: OUT }));
}
