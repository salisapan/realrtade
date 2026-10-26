'use strict';
// Training profiles for the relevance scorer. Separate from contrast-heldout-v0.
// Labels follow the owner spec in this file. They are not produced by judge().
const G = 'ai.local.flow@gmail.com';
const FRESH = '2026-10-01T09:00:00.000Z';
const STALE = '2024-03-01T00:00:00.000Z';

function base(id, extra) {
  extra = extra || {};
  const idn = extra.identity || {};
  return {
    schemaVersion: 'user-context-v0', userId: id, trainingConsent: false,
    identity: {
      aliases: idn.aliases || ['Sali', 'סאלי'],
      title: idn.title || '', department: idn.department || '',
      manager: idn.manager || null, groups: idn.groups || [], reports: idn.reports || []
    },
    relationships: extra.relationships || [],
    decisionHistory: extra.decisionHistory || [],
    workStyle: Object.assign({
      hours: { start: '09:00', end: '18:00', timezone: 'Asia/Jerusalem' },
      languages: ['he', 'en'], preferredTools: { files: 'drive', tasks: 'tasks' },
      savesFiles: 'unknown', answersGroupMailRate: null
    }, extra.workStyle || {}),
    preferences: extra.preferences || []
  };
}
function row(spec, side) {
  const g = spec[side];
  return {
    id: 'train-' + spec.id + '-' + side, pairId: spec.id, side: side,
    synthetic: true, labeledBy: 'synthetic-train', ownerVerified: false, consent: false,
    lang: spec.lang, scenario: spec.scenario, surface: spec.surface || 'gmail',
    direction: 'inbound', attachmentCount: spec.attachmentCount || 0,
    attachments: spec.attachments || [], to: spec.to, cc: spec.cc || [],
    from: spec.from, subject: spec.subject, body: spec.body,
    ownEmail: (spec.surface === 'outlook') ? 'glance.salisapan@outlook.com' : G,
    profile: g.profile, goldRelevance: g.relevance, goldAction: g.action
  };
}

function lines() {
  const out = [];
  const add = (s) => { out.push(row(s, 'A'), row(s, 'B')); };
  const domains = [
    ['nimbus.test', 'en'], ['oren.co.il', 'he'], ['kepler.test', 'en'], ['barak.co.il', 'he'],
    ['quill.test', 'en'], ['tzofit.co.il', 'he'], ['harbor.test', 'en'], ['almog.co.il', 'he']
  ];
  domains.forEach((pair, i) => {
    const [dom, lang] = pair;
    const dl = 'all@' + dom;
    const from = lang === 'he' ? { name: 'נועה', email: 'noa@' + dom } : { name: 'Noa', email: 'noa@' + dom };
    const ask = lang === 'he'
      ? 'היי לכולם,\n\nנא לאשר את הזמנת הציוד עד מחר.\n\nנועה'
      : 'Hi all,\n\nPlease approve the equipment order by tomorrow.\n\nNoa';
    add({ id: 't-ap-' + i, lang: lang, scenario: 'group-approver', subject: 'Order ' + i, from: from, to: [dl, G], body: ask,
      A: { profile: base('a' + i, { identity: { groups: [{ address: dl, role: 'approver', topics: [] }] } }), relevance: 'relevant', action: 'follow-up-ask|draft' },
      B: { profile: base('b' + i, { identity: { groups: [{ address: dl, role: 'member', topics: [] }] }, workStyle: { answersGroupMailRate: 0 } }), relevance: 'not_relevant', action: 'SILENT' } });

    const fyi = lang === 'he'
      ? 'היי לכולם,\n\nלידיעה בלבד. לא נדרשת פעולה.\n\nמצורף הסיכום.\n\nנועה'
      : 'Hi all,\n\nFor your information only. No action required.\n\nThe notes are attached.\n\nNoa';
    add({ id: 't-fyi-' + i, lang: lang, scenario: 'approver-fyi', subject: 'Notes ' + i, from: from, to: [dl, G], attachmentCount: 1, attachments: [{ name: 'notes-' + i + '.pdf' }], body: fyi,
      A: { profile: base('fa' + i, { identity: { groups: [{ address: dl, role: 'approver', topics: [] }] }, workStyle: { savesFiles: 'always' } }), relevance: 'relevant', action: 'drive-file|file_save' },
      B: { profile: base('fb' + i, { identity: { groups: [{ address: dl, role: 'approver', topics: [] }] }, workStyle: { savesFiles: 'never' }, preferences: [{ key: 'fyi', value: 'silent' }] }), relevance: 'not_relevant', action: 'SILENT' } });

    const named = lang === 'he'
      ? 'היי לכולם,\nמאיה, תוכלי לשלוח את הנספח עד חמישי?\n\nנועה'
      : 'Hi all,\nMaya, can you send the appendix by Thursday?\n\nNoa';
    add({ id: 't-oth-' + i, lang: lang, scenario: 'group-named-other', subject: 'Appendix ' + i, from: from, to: [dl, G], body: named,
      A: { profile: base('oa' + i, { identity: { groups: [{ address: dl, role: 'approver', topics: [] }], reports: [{ name: lang === 'he' ? 'מאיה' : 'Maya', email: 'maya@' + dom }] } }), relevance: 'relevant', action: 'follow-up-ask|draft' },
      B: { profile: base('ob' + i, { identity: { groups: [{ address: dl, role: 'approver', topics: [] }] } }), relevance: 'not_relevant', action: 'SILENT' } });

    const fileAsk = lang === 'he' ? 'שלום,\n\nבבקשה תתייק את הקובץ המצורף.\n\nנועה' : 'Hello,\n\nPlease file the attached workbook.\n\nNoa';
    const fname = lang === 'he' ? 'חשבונית-ספק-' + i + '.pdf' : 'vat-return-' + i + '.xlsx';
    add({ id: 't-file-' + i, lang: lang, scenario: 'role-in-filename', subject: 'Pack ' + i, from: from, to: [G], attachmentCount: 1, attachments: [{ name: fname }], body: fileAsk,
      A: { profile: base('ra' + i, { identity: { title: lang === 'he' ? 'חשבת' : 'CFO', department: lang === 'he' ? 'כספים' : 'Finance' }, workStyle: { savesFiles: 'always' } }), relevance: 'relevant', action: 'drive-file|file_save' },
      B: { profile: base('rb' + i, { identity: { title: lang === 'he' ? 'מהנדס' : 'Engineer', department: lang === 'he' ? 'פיתוח' : 'Platform' } }), relevance: 'unknown', action: 'SILENT' } });

    const look = lang === 'he' ? 'שלום,\n\nנא לאשר את החשבונית עד מחר.\n\nנועה' : 'Hello,\n\nPlease confirm the invoice by Friday.\n\nNoa';
    const exact = 'billing@' + dom;
    const fake = 'billing@' + dom.replace('.', '-pay.');
    add({ id: 't-look-' + i, lang: lang, scenario: 'lookalike-vendor', subject: 'Invoice ' + i, from: { name: 'Billing', email: fake }, to: [G], body: look,
      A: { profile: base('la' + i, { relationships: [{ key: exact, kind: 'sender', replyCount: 8, seenCount: 10, replyRate: 0.8, medianLatencyHours: 4 }], decisionHistory: [{ intentFamily: 'follow-up-ask', party: exact, approvedFetchedBack: 5, dismissed: 0, undo: 0, edited: 0, missedClose: 0, lastAt: FRESH }] }), relevance: 'not_relevant', action: 'SILENT' },
      B: { profile: base('lb' + i, { relationships: [{ key: fake, kind: 'sender', replyCount: 6, seenCount: 8, replyRate: 0.75, medianLatencyHours: 4 }], decisionHistory: [{ intentFamily: 'follow-up-ask', party: fake, approvedFetchedBack: 4, dismissed: 0, undo: 0, edited: 0, missedClose: 0, lastAt: FRESH }] }), relevance: 'relevant', action: 'follow-up-ask|draft' } });

    const renew = lang === 'he' ? 'היי,\n\nבבקשה תאשרי את החידוש עד יום ראשון.\n\nנועה' : 'Hi,\n\nCan you approve the renewal by Sunday?\n\nNoa';
    const party = 'vendor@' + dom;
    add({ id: 't-stale-' + i, lang: lang, scenario: 'stale-preference', subject: 'Renewal ' + i, from: { name: 'Vendor', email: party }, to: [G], body: renew,
      A: { profile: base('sa' + i, { preferences: [{ key: 'vendor', value: 'offer' }] }), relevance: 'relevant', action: 'follow-up-ask|draft' },
      B: { profile: base('sb' + i, { preferences: [{ key: 'vendor', value: 'offer' }], decisionHistory: [{ intentFamily: 'follow-up-ask', party: party, approvedFetchedBack: 0, dismissed: 4, undo: 1, edited: 0, missedClose: 0, lastAt: FRESH }] }), relevance: 'not_relevant', action: 'SILENT' } });

    const amount = lang === 'he' ? 'שלום,\n\nאישרנו 900 שקל עבור המשלוח.\n\nנועה' : 'Hello,\n\nWe approved $900 for the shipment.\n\nNoa';
    add({ id: 't-amt-' + i, lang: lang, scenario: 'amount', subject: 'Amount ' + i, from: from, to: [G], body: amount,
      A: { profile: base('ama' + i, { identity: { title: lang === 'he' ? 'חשבת' : 'CFO', department: lang === 'he' ? 'כספים' : 'Finance' } }), relevance: 'relevant', action: 'confirmed-amount|task' },
      B: { profile: base('amb' + i, { identity: { title: lang === 'he' ? 'מהנדס' : 'Engineer', department: lang === 'he' ? 'פיתוח' : 'Platform' } }), relevance: 'not_relevant', action: 'SILENT' } });

    add({ id: 't-old-' + i, lang: lang, scenario: 'stale-history', subject: 'Old ' + i, from: { name: 'Vendor', email: party }, to: [G], body: renew,
      A: { profile: base('oa2' + i, { decisionHistory: [{ intentFamily: 'follow-up-ask', party: party, approvedFetchedBack: 4, dismissed: 0, undo: 0, edited: 0, missedClose: 0, lastAt: STALE }] }), relevance: 'unknown', action: 'SILENT' },
      B: { profile: base('ob2' + i, { decisionHistory: [{ intentFamily: 'follow-up-ask', party: party, approvedFetchedBack: 4, dismissed: 0, undo: 0, edited: 0, missedClose: 0, lastAt: FRESH }] }), relevance: 'relevant', action: 'follow-up-ask|draft' } });
  });
  return out;
}

module.exports = { lines };
