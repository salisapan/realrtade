'use strict';
// contrast-heldout-v0. Written from the owner spec, not from featurize/judge.
// Same email, two synthetic profiles, two different correct actions.
// labeledBy is synthetic-heldout. Nothing here is an owner label.
// Do not import ./judge.cjs or ./featurize.cjs. Gold is set in this file.
// When goldAction is null, the action is today's v2 label and relevance is unknown.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GMAIL = 'ai.local.flow@gmail.com';
const OLK = 'glance.salisapan@outlook.com';
const OUT = path.join(__dirname, '..', 'labeling', 'contrast-heldout-v0.jsonl');
const FRESH = '2026-10-01T09:00:00.000Z';
const STALE = '2024-01-15T00:00:00.000Z';

function prof(id, extra) {
  extra = extra || {};
  const idn = extra.identity || {};
  return {
    schemaVersion: 'user-context-v0',
    userId: id,
    trainingConsent: false,
    identity: {
      aliases: idn.aliases || ['Sali', 'Sali Sapan', 'סאלי'],
      title: idn.title || '',
      department: idn.department || '',
      manager: idn.manager === undefined ? null : idn.manager,
      groups: idn.groups || [],
      reports: idn.reports || []
    },
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

function approver(id, address, topics) {
  return prof(id, { identity: { groups: [{ address: address, role: 'approver', topics: topics || [] }] } });
}
function member(id, address) {
  return prof(id, {
    identity: { groups: [{ address: address, role: 'member', topics: [] }] },
    workStyle: { answersGroupMailRate: 0 }
  });
}
function hist(family, party, counts, lastAt) {
  return Object.assign({
    intentFamily: family, party: party, approvedFetchedBack: 0, dismissed: 0, undo: 0, edited: 0, missedClose: 0,
    lastAt: lastAt || FRESH
  }, counts);
}
function rel(key, replyRate, seen) {
  return { key: key, kind: 'sender', replyCount: Math.round(replyRate * seen), seenCount: seen, replyRate: replyRate, medianLatencyHours: 6, answersGroupMail: null };
}

function pair(spec) {
  const email = {
    surface: spec.surface || 'gmail',
    direction: 'inbound',
    attachmentCount: spec.attachmentCount || 0,
    attachments: spec.attachments || [],
    to: spec.to,
    cc: spec.cc || [],
    from: spec.from,
    subject: spec.subject,
    body: spec.body
  };
  return ['A', 'B'].map((side) => {
    const gold = spec[side];
    return Object.assign({
      id: 'heldout-' + spec.id + '-' + side.toLowerCase(),
      pairId: spec.id,
      side: side,
      synthetic: true,
      labeledBy: 'synthetic-heldout',
      ownerVerified: false,
      consent: false,
      lang: spec.lang,
      scenario: spec.scenario,
      adversarial: !!spec.adversarial,
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

  // Group asks. The offer side is the owner/approver. New phrasing, senders, domains.
  add({ id: 'h01', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Desk order',
    from: { name: 'Imani Cole', email: 'imani@litware.com' }, to: ['facilities@litware.com', GMAIL],
    body: 'Hello everyone,\n\nThe facilities list needs a yes before we order the desks. Can the owner of this list confirm today?\n\nImani',
    A: { profile: approver('h01a', 'facilities@litware.com', []), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h01b', 'facilities@litware.com'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h02', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'ציוד',
    from: { name: 'תמר', email: 'tamar@proware.co.il' }, to: ['ops-all@proware.co.il', GMAIL],
    body: 'צוות יקר,\n\nמישהו יכול לאשר את הזמנת הציוד עד יום חמישי?\n\nתמר',
    A: { profile: member('h02a', 'ops-all@proware.co.il'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('h02b', 'ops-all@proware.co.il', []), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h03', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Warehouse lease',
    from: { name: 'Owen Blake', email: 'owen@fabrikam.net' }, to: ['legal-dl@fabrikam.net', GMAIL],
    body: 'Folks,\n\nA quick one: please sign off on the warehouse lease before Friday.\n\nOwen',
    A: { profile: approver('h03a', 'legal-dl@fabrikam.net', ['contract']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h03b', 'legal-dl@fabrikam.net'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h04', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'שכירות',
    from: { name: 'גיא', email: 'guy@woodgrove.io' }, to: ['all-staff@woodgrove.io', GMAIL],
    body: 'שלום לכולם,\n\nמבקשים אישור להסכם השכירות עד סוף השבוע.\n\nגיא',
    A: { profile: approver('h04a', 'all-staff@woodgrove.io', ['contract']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h04b', 'all-staff@woodgrove.io'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h05', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Benefit enrollment',
    from: { name: 'Chloe Ng', email: 'chloe@adventure-works.co' }, to: [GMAIL], cc: ['people-ops@adventure-works.co'],
    body: 'Hi team,\n\nCould someone approve the benefit enrollment window by Tuesday?\n\nChloe',
    A: { profile: member('h05a', 'people-ops@adventure-works.co'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('h05b', 'people-ops@adventure-works.co', ['onboarding']), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h06', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'קליטת ספק',
    from: { name: 'ליאור', email: 'lior@tailspin.co.il' }, to: [OLK], cc: ['vendors@tailspin.co.il'], surface: 'outlook',
    body: 'היי חברים,\n\nנא לאשר את קליטת הספק החדש עד מחר בבוקר.\n\nליאור',
    A: { profile: approver('h06a', 'vendors@tailspin.co.il', ['onboarding']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h06b', 'vendors@tailspin.co.il'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h07', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Campaign cap',
    from: { name: 'Ned Ortiz', email: 'ned@wideworldimporters.com' }, to: ['finance-dl@wideworldimporters.com', GMAIL],
    body: 'Good morning all,\n\nPlease confirm the campaign cap of $12,000 before we launch.\n\nNed',
    A: { profile: approver('h07a', 'finance-dl@wideworldimporters.com', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h07b', 'finance-dl@wideworldimporters.com'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h08', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'תקרה',
    from: { name: 'מיה', email: 'mia@contoso.co.il' }, to: ['kesef@contoso.co.il', GMAIL],
    body: 'אהלן לכולם,\n\nאפשר לאשר תקרה של 18,000 שקל לקמפיין עד יום ראשון?\n\nמיה',
    A: { profile: member('h08a', 'kesef@contoso.co.il'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('h08b', 'kesef@contoso.co.il', ['finance']), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Adversarial: profile says approver, the mail is an FYI. Approver is not an offer by itself.
  add({ id: 'h09', lang: 'en', scenario: 'approver-fyi', adversarial: true, depends_on: 'work_style.files', subject: 'Onboarding pack',
    from: { name: 'Priya Shah', email: 'priya@northwind.io' }, to: ['people@northwind.io', GMAIL], attachmentCount: 1,
    attachments: [{ name: 'onboarding-pack.pdf' }],
    body: 'Hi all,\n\nFor your information only. No action required.\n\nThe onboarding pack is attached.\n\nPriya',
    A: { profile: prof('h09a', { identity: { groups: [{ address: 'people@northwind.io', role: 'approver', topics: ['onboarding'] }] }, workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h09b', { identity: { groups: [{ address: 'people@northwind.io', role: 'approver', topics: ['onboarding'] }] }, workStyle: { savesFiles: 'never' }, preferences: [{ key: 'save', value: 'silent' }, { key: 'fyi', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h10', lang: 'he', scenario: 'approver-fyi', adversarial: true, depends_on: 'work_style.files', subject: 'סיכום קליטה',
    from: { name: 'אור', email: 'or@globex.co.il' }, to: ['hr-all@globex.co.il', GMAIL], attachmentCount: 1,
    attachments: [{ name: 'klita-summary.pdf' }],
    body: 'היי לכולם,\n\nלידיעה בלבד. לא נדרשת פעולה.\n\nמצורף סיכום הקליטה.\n\nאור',
    A: { profile: prof('h10a', { identity: { groups: [{ address: 'hr-all@globex.co.il', role: 'approver', topics: ['onboarding'] }] }, workStyle: { savesFiles: 'never' }, preferences: [{ key: 'fyi', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h10b', { identity: { groups: [{ address: 'hr-all@globex.co.il', role: 'approver', topics: ['onboarding'] }] }, workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' } });
  add({ id: 'h11', lang: 'en', scenario: 'approver-fyi', adversarial: true, depends_on: 'work_style.files', subject: 'Minutes',
    from: { name: 'Ruth Pell', email: 'ruth@litware.com' }, to: ['board-list@litware.com', OLK], surface: 'outlook', attachmentCount: 1,
    attachments: [{ name: 'board-minutes.docx' }],
    body: 'Hello all,\n\nFYI only. Nothing is required from you.\n\nMinutes are attached for the archive.\n\nRuth',
    A: { profile: prof('h11a', { identity: { groups: [{ address: 'board-list@litware.com', role: 'owner', topics: ['board'] }] }, workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h11b', { identity: { groups: [{ address: 'board-list@litware.com', role: 'owner', topics: ['board'] }] }, workStyle: { savesFiles: 'never' }, preferences: [{ key: 'save', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h12', lang: 'he', scenario: 'approver-fyi', adversarial: true, depends_on: 'work_style.files', subject: 'לתיעוד',
    from: { name: 'הילה', email: 'hila@proware.co.il' }, to: ['finance-all@proware.co.il', GMAIL], attachmentCount: 1,
    attachments: [{ name: 'minutes-h1.pdf' }],
    body: 'שלום לכולם,\n\nלתיעוד בלבד. אין צורך בפעולה.\n\nהמסמך מצורף.\n\nהילה',
    A: { profile: prof('h12a', { identity: { groups: [{ address: 'finance-all@proware.co.il', role: 'approver', topics: ['finance'] }] }, workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h12b', { identity: { groups: [{ address: 'finance-all@proware.co.il', role: 'member', topics: [] }] }, workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' } });

  // Adversarial: group greeting, the ask names someone else.
  add({ id: 'h13', lang: 'en', scenario: 'group-named-other', adversarial: true, depends_on: 'covers_addressee', subject: 'Countersigned schedule',
    from: { name: 'Evan Cho', email: 'evan@fabrikam.net' }, to: ['deals@fabrikam.net', GMAIL],
    body: 'Hi all,\nMaya, can you send the countersigned schedule by Wednesday?\n\nEvan',
    A: { profile: prof('h13a', { identity: { groups: [{ address: 'deals@fabrikam.net', role: 'approver', topics: ['contract'] }], reports: [{ name: 'Maya', email: 'maya@fabrikam.net' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h13b', { identity: { groups: [{ address: 'deals@fabrikam.net', role: 'approver', topics: ['contract'] }] } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h14', lang: 'he', scenario: 'group-named-other', adversarial: true, depends_on: 'covers_addressee', subject: 'טיוטה',
    from: { name: 'עומר', email: 'omer@woodgrove.io' }, to: ['all@woodgrove.io', GMAIL],
    body: 'היי לכולם,\nנועה, תוכלי להחזיר את הטיוטה עד מחר?\n\nעומר',
    A: { profile: prof('h14a', { identity: { groups: [{ address: 'all@woodgrove.io', role: 'approver', topics: [] }] } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h14b', { identity: { groups: [{ address: 'all@woodgrove.io', role: 'member', topics: [] }], reports: [{ name: 'נועה', email: 'noa@woodgrove.io' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h15', lang: 'en', scenario: 'group-named-other', adversarial: true, depends_on: 'covers_addressee', subject: 'Venue',
    from: { name: 'Lila Grant', email: 'lila@adventure-works.co' }, to: ['events@adventure-works.co', OLK], surface: 'outlook',
    body: 'Hello team,\nRavi — would you confirm the venue hold by Thursday?\n\nLila',
    A: { profile: prof('h15a', { identity: { aliases: ['Ravi', 'Ravi Shah'], groups: [{ address: 'events@adventure-works.co', role: 'member', topics: [] }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h15b', { identity: { groups: [{ address: 'events@adventure-works.co', role: 'approver', topics: [] }] } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h16', lang: 'he', scenario: 'group-named-other', adversarial: true, depends_on: 'covers_addressee', subject: 'חוזה',
    from: { name: 'דנה', email: 'dana@tailspin.co.il' }, to: ['legal@tailspin.co.il', GMAIL],
    body: 'שלום לכולם,\nיוסי, אפשר לאשר את החוזה מחר?\n\nדנה',
    A: { profile: prof('h16a', { identity: { groups: [{ address: 'legal@tailspin.co.il', role: 'owner', topics: ['contract'] }], reports: [{ name: 'יוסי', email: 'yossi@tailspin.co.il' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h16b', { identity: { aliases: ['סאלי'], groups: [{ address: 'legal@tailspin.co.il', role: 'owner', topics: ['contract'] }] } }), action: 'SILENT', relevance: 'not_relevant' } });

  // Adversarial: role match lives only in the attachment name.
  add({ id: 'h17', lang: 'en', scenario: 'role-in-filename', adversarial: true, depends_on: 'role_matches_topic', subject: 'Weekly pack',
    from: { name: 'Jonah Hale', email: 'jonah@northwind.io' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'Q3-vat-return.xlsx' }],
    body: 'Hello,\n\nPlease file the attached workbook.\n\nJonah',
    A: { profile: prof('h17a', { identity: { title: 'CFO', department: 'Finance' }, workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h17b', { identity: { title: 'Engineer', department: 'Platform' }, workStyle: { savesFiles: 'unknown' } }), action: null, relevance: 'unknown' } });
  add({ id: 'h18', lang: 'he', scenario: 'role-in-filename', adversarial: true, depends_on: 'role_matches_topic', subject: 'חבילה שבועית',
    from: { name: 'נועם', email: 'noam@globex.co.il' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'חשבונית-ספק-4481.pdf' }],
    body: 'שלום,\n\nבבקשה תתייק את הקובץ המצורף.\n\nנועם',
    A: { profile: prof('h18a', { identity: { title: 'מעצבת', department: 'מוצר' }, workStyle: { savesFiles: 'unknown' } }), action: null, relevance: 'unknown' },
    B: { profile: prof('h18b', { identity: { title: 'סמנכ"ל כספים', department: 'כספים' }, workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' } });
  add({ id: 'h19', lang: 'en', scenario: 'role-in-filename', adversarial: true, depends_on: 'role_matches_topic', subject: 'Packet',
    from: { name: 'Ada Ruiz', email: 'ada@litware.com' }, to: toO, surface: 'outlook', attachmentCount: 1,
    attachments: [{ name: 'new-hire-checklist.docx' }],
    body: 'Hi,\n\nPlease save the attached packet to OneDrive.\n\nAda',
    A: { profile: prof('h19a', { identity: { title: 'HR Partner', department: 'Human Resources' }, workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h19b', { identity: { title: 'Controller', department: 'Finance' }, workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h20', lang: 'he', scenario: 'role-in-filename', adversarial: true, depends_on: 'role_matches_topic', subject: 'מסמך',
    from: { name: 'יעל', email: 'yael@proware.co.il' }, to: toO, surface: 'outlook', attachmentCount: 1,
    attachments: [{ name: 'הסכם-שכירות.pdf' }],
    body: 'היי,\n\nנא לשמור את המצורף.\n\nיעל',
    A: { profile: prof('h20a', { identity: { title: 'מהנדס', department: 'תפעול' }, workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h20b', { identity: { title: 'יועצת משפטית', department: 'משפטי' }, workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' } });

  // Adversarial: the user always pays a vendor; this mail is a lookalike domain.
  add({ id: 'h21', lang: 'en', scenario: 'lookalike-vendor', adversarial: true, depends_on: 'history_closed', subject: 'March invoice',
    from: { name: 'Northwind Billing', email: 'billing@northwind-pay.com' }, to: toG,
    body: 'Hello,\n\nPlease confirm this month\'s invoice for $4,200 by Friday.\n\nNorthwind Billing',
    A: { profile: prof('h21a', { relationships: [rel('billing@northwind-pay.com', 0.8, 10)], decisionHistory: [hist('follow-up-ask', 'billing@northwind-pay.com', { approvedFetchedBack: 5 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h21b', { relationships: [rel('billing@northwind.com', 0.9, 14)], decisionHistory: [hist('follow-up-ask', 'billing@northwind.com', { approvedFetchedBack: 6 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h22', lang: 'he', scenario: 'lookalike-vendor', adversarial: true, depends_on: 'history_closed', subject: 'חשבונית מרץ',
    from: { name: 'חנה', email: 'hannah@globex-billing.co.il' }, to: toG,
    body: 'שלום,\n\nנא לאשר את חשבונית מרץ על סך 3,600 שקל עד יום רביעי.\n\nחנה',
    A: { profile: prof('h22a', { relationships: [rel('hannah@globex.co.il', 0.85, 12)], decisionHistory: [hist('follow-up-ask', 'hannah@globex.co.il', { approvedFetchedBack: 4 })] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h22b', { relationships: [rel('hannah@globex-billing.co.il', 0.7, 8)], decisionHistory: [hist('follow-up-ask', 'hannah@globex-billing.co.il', { approvedFetchedBack: 4 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h23', lang: 'en', scenario: 'lookalike-vendor', adversarial: true, depends_on: 'history_closed', subject: 'Payout statement',
    from: { name: 'Accounts', email: 'accounts@contoso-secure.co' }, to: toO, surface: 'outlook', attachmentCount: 1,
    attachments: [{ name: 'payout-statement.pdf' }],
    body: 'Hi,\n\nKindly validate the payout details on the attached statement for $890.\n\nAccounts',
    A: { profile: prof('h23a', { relationships: [rel('accounts@contoso-secure.co', 0.75, 9)], decisionHistory: [hist('follow-up-ask', 'accounts@contoso-secure.co', { approvedFetchedBack: 3 })], workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h23b', { relationships: [rel('accounts@contoso.com', 0.95, 20)], decisionHistory: [hist('follow-up-ask', 'accounts@contoso.com', { approvedFetchedBack: 8 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h24', lang: 'he', scenario: 'lookalike-vendor', adversarial: true, depends_on: 'history_closed', subject: 'תשלום',
    from: { name: 'הנהלת חשבונות', email: 'pay@proware-payments.co.il' }, to: toG,
    body: 'היי,\n\nאפשר לאשר את התשלום החודשי עד מחר?\n\nהנהלת חשבונות',
    A: { profile: prof('h24a', { relationships: [rel('pay@proware.co.il', 0.9, 15)], decisionHistory: [hist('follow-up-ask', 'pay@proware.co.il', { approvedFetchedBack: 7 })] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h24b', { relationships: [rel('pay@proware-payments.co.il', 0.6, 6)], decisionHistory: [hist('follow-up-ask', 'pay@proware-payments.co.il', { approvedFetchedBack: 3 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Adversarial: a preference the later behavior revoked, and a decayed history.
  add({ id: 'h25', lang: 'en', scenario: 'stale-preference', adversarial: true, depends_on: 'explicit_preference', subject: 'Vendor renewal',
    from: { name: 'Seth', email: 'seth@vendor.example' }, to: toG,
    body: 'Hi,\n\nCan you approve the vendor renewal by Friday?\n\nSeth',
    A: { profile: prof('h25a', { preferences: [{ key: 'vendor', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h25b', { preferences: [{ key: 'vendor', value: 'offer' }], decisionHistory: [hist('follow-up-ask', 'seth@vendor.example', { dismissed: 4, undo: 2 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h26', lang: 'he', scenario: 'stale-preference', adversarial: true, depends_on: 'history_closed', subject: 'חידוש',
    from: { name: 'עמית', email: 'amit@vendor.co.il' }, to: toG,
    body: 'שלום,\n\nנא לחדש את ההתקשרות עד יום שני.\n\nעמית',
    A: { profile: prof('h26a', { decisionHistory: [hist('follow-up-ask', 'amit@vendor.co.il', { approvedFetchedBack: 4 }, STALE)] }), action: null, relevance: 'unknown' },
    B: { profile: prof('h26b', { decisionHistory: [hist('follow-up-ask', 'amit@vendor.co.il', { approvedFetchedBack: 4 }, FRESH)] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h27', lang: 'en', scenario: 'stale-preference', adversarial: true, depends_on: 'explicit_preference', subject: 'Group digest',
    from: { name: 'List', email: 'list@fabrikam.net' }, to: ['all@fabrikam.net', GMAIL],
    body: 'Hi all,\n\nCould you reply with the headcount by Thursday?\n\nList',
    A: { profile: prof('h27a', { preferences: [{ key: 'group', value: 'silent' }], decisionHistory: [hist('follow-up-ask', 'list@fabrikam.net', { approvedFetchedBack: 5 }, STALE)] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h27b', { preferences: [{ key: 'group', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h28', lang: 'he', scenario: 'stale-preference', adversarial: true, depends_on: 'explicit_preference', subject: 'ספק',
    from: { name: 'רונית', email: 'ronit@sapan-vendor.co.il' }, to: toG,
    body: 'היי,\n\nבבקשה תאשרי את ההצעה עד מחר.\n\nרונית',
    A: { profile: prof('h28a', { preferences: [{ key: 'vendor', value: 'silent' }], decisionHistory: [hist('follow-up-ask', 'ronit@sapan-vendor.co.il', { approvedFetchedBack: 3 }, STALE)] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h28b', { preferences: [{ key: 'vendor', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Cc-only, new domains.
  add({ id: 'h29', lang: 'en', scenario: 'cc-only', depends_on: 'cc_reply_rate', subject: 'PO copy',
    from: { name: 'Bea', email: 'bea@litware.com' }, to: ['buyer@litware.com'], cc: [GMAIL],
    body: 'Hi,\n\nCan you send the PO copy by Monday?\n\nBea',
    A: { profile: prof('h29a', { relationships: [rel('bea@litware.com', 0.9, 12)] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h29b', { relationships: [rel('bea@litware.com', 0, 8)] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h30', lang: 'he', scenario: 'cc-only', depends_on: 'cc_reply_rate', subject: 'העתק',
    from: { name: 'איתי', email: 'itai@proware.co.il' }, to: ['koneh@proware.co.il'], cc: [GMAIL],
    body: 'שלום,\n\nאפשר להעביר את העתק ההזמנה עד מחר?\n\nאיתי',
    A: { profile: prof('h30a', { relationships: [rel('itai@proware.co.il', 0, 7)] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h30b', { relationships: [rel('itai@proware.co.il', 0.8, 10)] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h31', lang: 'en', scenario: 'cc-only', depends_on: 'explicit_preference', subject: 'Looping you',
    from: { name: 'Maren', email: 'maren@fabrikam.net' }, to: ['owner@fabrikam.net'], cc: [OLK], surface: 'outlook',
    body: 'Hello,\n\nCould you review the redlines I copied you on?\n\nMaren',
    A: { profile: prof('h31a', { preferences: [{ key: 'cc', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h31b', { preferences: [{ key: 'cc', value: 'silent' }], relationships: [rel('maren@fabrikam.net', 0, 4)] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h32', lang: 'he', scenario: 'cc-only', depends_on: 'explicit_preference', subject: 'לידיעתך',
    from: { name: 'שירה', email: 'shira@woodgrove.io' }, to: ['maya@woodgrove.io'], cc: [GMAIL],
    body: 'היי,\n\nנא לעבור על ההערות שהעתקתי אליך.\n\nשירה',
    A: { profile: prof('h32a', { preferences: [{ key: 'cc', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h32b', { preferences: [{ key: 'cc', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Manager vs not, different names.
  add({ id: 'h33', lang: 'en', scenario: 'manager', depends_on: 'manager_request', subject: 'Board pack',
    from: { name: 'Helena Voss', email: 'helena@adventure-works.co' }, to: toG,
    body: 'Hi,\n\nPlease send the board pack by noon.\n\nHelena',
    A: { profile: prof('h33a', { identity: { manager: { name: 'Helena Voss', email: 'helena@adventure-works.co' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h33b', { identity: { manager: { name: 'Other Lead', email: 'lead@adventure-works.co' } }, workStyle: { answersGroupMailRate: 0 }, relationships: [rel('helena@adventure-works.co', 0, 3)] }), action: null, relevance: 'unknown' } });
  add({ id: 'h34', lang: 'he', scenario: 'manager', depends_on: 'manager_request', subject: 'סטטוס שבועי',
    from: { name: 'רינה', email: 'rina@contoso.co.il' }, to: ['team@contoso.co.il', GMAIL],
    body: 'היי לכולם,\n\nתשלחו לי את הסטטוס עד סוף היום.\n\nרינה',
    A: { profile: prof('h34a', { identity: { manager: { name: 'אחר', email: 'other@contoso.co.il' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h34b', { identity: { manager: { name: 'רינה', email: 'rina@contoso.co.il' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h35', lang: 'en', scenario: 'manager', depends_on: 'manager_request', subject: 'Thursday room',
    from: { name: 'Marcus Adeyemi', email: 'marcus@litware.com' }, to: toG,
    body: 'Hello,\n\nCan you book the room for Thursday at 10:00?\n\nMarcus',
    A: { profile: prof('h35a', { identity: { manager: { name: 'Marcus Adeyemi', email: 'marcus@litware.com' } } }), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('h35b', { identity: { aliases: ['Dana'], manager: { name: 'Someone', email: 'someone@litware.com' } } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h36', lang: 'he', scenario: 'manager', depends_on: 'manager_request', subject: 'חדר',
    from: { name: 'אלון', email: 'alon@proware.co.il' }, to: toO, surface: 'outlook',
    body: 'היי לכולם,\n\nבבקשה תשלחו לי את סיכום הפגישה עד מחר.\n\nאלון',
    A: { profile: prof('h36a', { identity: { manager: { name: 'אחר', email: 'x@proware.co.il' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h36b', { identity: { manager: { name: 'אלון', email: 'alon@proware.co.il' } } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Save always vs never, new verbs and domains.
  add({ id: 'h37', lang: 'en', scenario: 'save-file', depends_on: 'work_style.files', subject: 'Workbook',
    from: { name: 'Tess', email: 'tess@wideworldimporters.com' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'inventory.xlsx' }],
    body: 'Hi,\n\nPlease put the spreadsheet in Drive.\n\nTess',
    A: { profile: prof('h37a', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h37b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h38', lang: 'he', scenario: 'save-file', depends_on: 'work_style.files', subject: 'עותק',
    from: { name: 'קרן', email: 'karen@tailspin.co.il' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'copy.pdf' }],
    body: 'שלום,\n\nבבקשה לשמור עותק בדרייב.\n\nקרן',
    A: { profile: prof('h38a', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h38b', { workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' } });
  add({ id: 'h39', lang: 'en', scenario: 'save-file', depends_on: 'work_style.files', subject: 'Archive',
    from: { name: 'Hugo', email: 'hugo@northwind.io' }, to: toO, surface: 'outlook', attachmentCount: 1,
    attachments: [{ name: 'archive.pdf' }],
    body: 'Hello,\n\nPlease archive the pdf in OneDrive.\n\nHugo',
    A: { profile: prof('h39a', { workStyle: { savesFiles: 'always' }, files: 'onedrive' }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h39b', { workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h40', lang: 'he', scenario: 'save-file', depends_on: 'history_closed', subject: 'קובץ ספק',
    from: { name: 'מולי', email: 'muli@globex.co.il' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'supplier.pdf' }],
    body: 'היי,\n\nתשמרי את הקובץ המצורף בדרייב.\n\nמולי',
    A: { profile: prof('h40a', { decisionHistory: [hist('file_save', 'muli@globex.co.il', { undo: 3 })] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h40b', { decisionHistory: [hist('file_save', 'muli@globex.co.il', { approvedFetchedBack: 3 })] }), action: 'drive-file|file_save', relevance: 'relevant' } });
  add({ id: 'h41', lang: 'en', scenario: 'save-file', depends_on: 'explicit_preference', subject: 'Do not file',
    from: { name: 'Nia', email: 'nia@litware.com' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'notes.pdf' }],
    body: 'Sali, please reply by Friday. Do not save the attached file.\n\nNia',
    A: { profile: prof('h41a', { workStyle: { savesFiles: 'always' }, preferences: [{ key: 'save', value: 'offer' }] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h41b', { identity: { aliases: ['Dana'] }, workStyle: { savesFiles: 'always' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h42', lang: 'he', scenario: 'save-file', depends_on: 'work_style.files', subject: 'אל תשמור',
    from: { name: 'טל', email: 'tal@proware.co.il' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'draft.pdf' }],
    body: 'סאלי, בבקשה תחזרי אלי עד מחר. אל תשמרי את הקובץ.\n\nטל',
    A: { profile: prof('h42a', { identity: { aliases: ['דנה'] } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h42b', { workStyle: { savesFiles: 'always' } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  // Calendar on Gmail only. Outlook pair h36 already records the cap as silence.
  add({ id: 'h43', lang: 'en', scenario: 'calendar', depends_on: 'named_addressee', subject: 'Design review',
    from: { name: 'Paul', email: 'paul@fabrikam.net' }, to: toG,
    body: 'Hi Sali,\n\nCan we meet tomorrow at 11:00 for the design review?\n\nPaul',
    A: { profile: prof('h43a'), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('h43b', { identity: { aliases: ['Dana'] } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h44', lang: 'he', scenario: 'calendar', depends_on: 'named_addressee', subject: 'סקירה',
    from: { name: 'מאיה', email: 'maya@woodgrove.io' }, to: toG,
    body: 'היי סאלי,\n\nאפשר פגישה ביום רביעי בשעה 9:30?\n\nמאיה',
    A: { profile: prof('h44a', { identity: { aliases: ['נועה'] } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h44b'), action: 'event|calendar', relevance: 'relevant' } });
  add({ id: 'h45', lang: 'en', scenario: 'calendar', depends_on: 'manager_request', subject: 'Staff call',
    from: { name: 'Helena Voss', email: 'helena@adventure-works.co' }, to: ['team@adventure-works.co', GMAIL],
    body: 'Hi team,\n\nPlease hold Thursday at 15:00 for the staff call.\n\nHelena',
    A: { profile: prof('h45a', { identity: { manager: { name: 'Helena Voss', email: 'helena@adventure-works.co' } } }), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('h45b', { identity: { manager: { name: 'Other', email: 'o@adventure-works.co' } }, workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h46', lang: 'he', scenario: 'calendar', depends_on: 'covers_addressee', subject: 'הדגמה',
    from: { name: 'עידו', email: 'ido@contoso.co.il' }, to: toG,
    body: 'היי דנה,\n\nתקבעי זום מחר בשעה 12:00 להדגמה?\n\nעידו',
    A: { profile: prof('h46a', { identity: { aliases: ['סאלי'], reports: [{ name: 'דנה', email: 'dana@contoso.co.il' }] } }), action: 'event|calendar', relevance: 'relevant' },
    B: { profile: prof('h46b'), action: 'SILENT', relevance: 'not_relevant' } });

  // Commitments and amounts.
  add({ id: 'h47', lang: 'en', scenario: 'commitment', depends_on: 'named_addressee', subject: 'You agreed',
    from: { name: 'Cleo', email: 'cleo@litware.com' }, to: toG,
    body: 'Hi Sali,\n\nYou agreed to send the security answers by Monday.\n\nCleo',
    A: { profile: prof('h47a'), action: 'commitment|task', relevance: 'relevant' },
    B: { profile: prof('h47b', { identity: { aliases: ['Omar'] } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h48', lang: 'he', scenario: 'commitment', depends_on: 'named_addressee', subject: 'סיכמנו',
    from: { name: 'ורד', email: 'vered@proware.co.il' }, to: toG,
    body: 'היי סאלי,\n\nסיכמנו שאת שולחת את הנספח עד יום שלישי.\n\nורד',
    A: { profile: prof('h48a', { identity: { aliases: ['יוסי'] } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h48b'), action: 'commitment|task', relevance: 'relevant' } });
  add({ id: 'h49', lang: 'en', scenario: 'amount', depends_on: 'role_matches_topic', subject: 'Fee',
    from: { name: 'Ivan', email: 'ivan@fabrikam.net' }, to: toG,
    body: 'Hello,\n\nWe approved $2,750 for the relocation.\n\nIvan',
    A: { profile: prof('h49a', { identity: { title: 'CFO', department: 'Finance' } }), action: 'confirmed-amount|task', relevance: 'relevant' },
    B: { profile: prof('h49b', { identity: { title: 'Engineer', department: 'Platform' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h50', lang: 'he', scenario: 'amount', depends_on: 'role_matches_topic', subject: 'סכום',
    from: { name: 'גל', email: 'gal@globex.co.il' }, to: toG,
    body: 'שלום,\n\nאישרנו 4,100 שקל עבור ההובלה.\n\nגל',
    A: { profile: prof('h50a', { identity: { title: 'מהנדס', department: 'פיתוח' } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h50b', { identity: { title: 'חשבת', department: 'כספים' } }), action: 'confirmed-amount|task', relevance: 'relevant' } });

  // More mix: addressed-other, recurring vendor, group rate, fyi preference.
  add({ id: 'h51', lang: 'en', scenario: 'addressed-other', depends_on: 'covers_addressee', subject: 'The report',
    from: { name: 'Nina', email: 'nina@adventure-works.co' }, to: toG,
    body: 'Hi Leila,\n\nCould you walk through the report by Thursday?\n\nNina',
    A: { profile: prof('h51a', { identity: { reports: [{ name: 'Leila', email: 'leila@adventure-works.co' }] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h51b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h52', lang: 'he', scenario: 'addressed-other', depends_on: 'named_addressee', subject: 'דוח',
    from: { name: 'אבי', email: 'avi@contoso.co.il' }, to: toG,
    body: 'היי מאיה,\n\nתוכלי לעבור על הדוח עד יום חמישי?\n\nאבי',
    A: { profile: prof('h52a', { identity: { aliases: ['מאיה'] } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h52b'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h53', lang: 'en', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'Monthly retainer',
    from: { name: 'Bill', email: 'bill@retain.example' }, to: toG,
    body: 'Hi,\n\nPlease confirm the monthly retainer by the 3rd.\n\nBill',
    A: { profile: prof('h53a', { decisionHistory: [hist('follow-up-ask', 'bill@retain.example', { dismissed: 3, undo: 1 })] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h53b', { decisionHistory: [hist('follow-up-ask', 'bill@retain.example', { approvedFetchedBack: 4 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h54', lang: 'he', scenario: 'recurring-vendor', depends_on: 'history_closed', subject: 'ריטיינר',
    from: { name: 'ברוך', email: 'baruch@retain.co.il' }, to: toG,
    body: 'שלום,\n\nנא לאשר את הריטיינר החודשי.\n\nברוך',
    A: { profile: prof('h54a', { decisionHistory: [hist('follow-up-ask', 'baruch@retain.co.il', { approvedFetchedBack: 3 })] }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h54b', { decisionHistory: [hist('follow-up-ask', 'baruch@retain.co.il', { dismissed: 4 })] }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h55', lang: 'en', scenario: 'group-approver', depends_on: 'answers_group_mail_rate', subject: 'Headcount',
    from: { name: 'Uma', email: 'uma@tailspin.co.il' }, to: ['everyone@tailspin.co.il', GMAIL],
    body: 'Hi all,\n\nCan you send your headcount by Wednesday?\n\nUma',
    A: { profile: prof('h55a', { workStyle: { answersGroupMailRate: 0.9 } }), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: prof('h55b', { workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h56', lang: 'he', scenario: 'group-approver', depends_on: 'answers_group_mail_rate', subject: 'מצבת',
    from: { name: 'ליה', email: 'lia@woodgrove.io' }, to: ['kolam@woodgrove.io', GMAIL],
    body: 'היי לכולם,\n\nתשלחו את המצבת עד יום שלישי?\n\nליה',
    A: { profile: prof('h56a', { workStyle: { answersGroupMailRate: 0 } }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h56b', { workStyle: { answersGroupMailRate: 0.85 } }), action: 'follow-up-ask|draft', relevance: 'relevant' } });
  add({ id: 'h57', lang: 'en', scenario: 'fyi', depends_on: 'explicit_preference', subject: 'For the file',
    from: { name: 'Otto', email: 'otto@litware.com' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'notes.pdf' }],
    body: 'Hi,\n\nFor your records. No action required.\n\nOtto',
    A: { profile: prof('h57a', { preferences: [{ key: 'fyi', value: 'offer' }], workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' },
    B: { profile: prof('h57b', { preferences: [{ key: 'fyi', value: 'silent' }], workStyle: { savesFiles: 'never' } }), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h58', lang: 'he', scenario: 'fyi', depends_on: 'explicit_preference', subject: 'לידיעה',
    from: { name: 'סיון', email: 'sivan@fabrikam.net' }, to: toG, attachmentCount: 1,
    attachments: [{ name: 'note.pdf' }],
    body: 'שלום,\n\nלידיעה בלבד. לא נדרשת פעולה. מצורף.\n\nסיון',
    A: { profile: prof('h58a', { preferences: [{ key: 'fyi', value: 'silent' }] }), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: prof('h58b', { preferences: [{ key: 'fyi', value: 'offer' }], workStyle: { savesFiles: 'always' } }), action: 'drive-file|file_save', relevance: 'relevant' } });
  add({ id: 'h59', lang: 'en', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'Press hold',
    from: { name: 'Vera', email: 'vera@northwind.io' }, to: ['comms@northwind.io', GMAIL],
    body: 'Hey everyone,\n\nPlease approve the press hold before 4pm.\n\nVera',
    A: { profile: approver('h59a', 'comms@northwind.io', []), action: 'follow-up-ask|draft', relevance: 'relevant' },
    B: { profile: member('h59b', 'comms@northwind.io'), action: 'SILENT', relevance: 'not_relevant' } });
  add({ id: 'h60', lang: 'he', scenario: 'group-approver', depends_on: 'user_is_approver_for', subject: 'הודעה',
    from: { name: 'אופיר', email: 'ofir@contoso.co.il' }, to: ['comms@contoso.co.il', OLK], surface: 'outlook',
    body: 'היי לכולם,\n\nנא לאשר את נוסח ההודעה עד השעה ארבע.\n\nאופיר',
    A: { profile: member('h60a', 'comms@contoso.co.il'), action: 'SILENT', relevance: 'not_relevant' },
    B: { profile: approver('h60b', 'comms@contoso.co.il', []), action: 'follow-up-ask|draft', relevance: 'relevant' } });

  return P;
}

function fillUnknown(rows) {
  const { make } = require('../model/runtime/glance-close-v2.cjs');
  const { DEFAULT_OWN_NAMES } = require('../model/runtime/pipeline-v2.cjs');
  const v2 = make('v2');
  const today = new Map();
  for (const r of rows) {
    if (r.goldAction) continue;
    if (!today.has(r.pairId)) {
      today.set(r.pairId, v2.decide({
        id: r.id, lang: r.lang, surface: r.surface, direction: 'inbound',
        subject: r.subject, body: r.body, from: r.from, to: r.to, cc: r.cc,
        attachmentCount: r.attachmentCount || 0,
        ownNames: DEFAULT_OWN_NAMES.slice()
      }).label);
    }
    r.goldAction = today.get(r.pairId);
    r.goldRelevance = 'unknown';
  }
  return rows;
}

function write() {
  const rows = fillUnknown(lines());
  const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(OUT, text);
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  fs.writeFileSync(OUT + '.sha256', sha + '\n');
  return { rows: rows, sha: sha };
}

module.exports = { lines, fillUnknown, write, OUT };

if (require.main === module) {
  const out = write();
  const pairs = new Map();
  for (const r of out.rows) {
    if (!pairs.has(r.pairId)) pairs.set(r.pairId, []);
    pairs.get(r.pairId).push(r);
  }
  const same = [];
  for (const [id, sides] of pairs) {
    if (sides[0].goldAction === sides[1].goldAction) same.push(id + ':' + sides[0].goldAction);
  }
  const he = new Set(out.rows.filter((r) => r.lang === 'he').map((r) => r.pairId)).size;
  const en = new Set(out.rows.filter((r) => r.lang === 'en').map((r) => r.pairId)).size;
  console.log(JSON.stringify({ pairs: pairs.size, lines: out.rows.length, he: he, en: en, sha: out.sha, sameGold: same }, null, 2));
}
