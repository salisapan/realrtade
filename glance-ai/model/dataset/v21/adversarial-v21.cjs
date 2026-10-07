'use strict';
// adversarial-v21 = adversarial-v2 (unchanged, 74 rows) + 40 BARE / SHORT probes (no greeting, no signature, mostly empty
// subject): positive non-file asks (draft / calendar / Drive-OneDrive save) and short silent traps (acks, negations, FYI,
// paid/cancelled, colleague-addressed, Cc-only, hedged save, Gmail->OneDrive, marketing). Subject-only asks are AMBIGUOUS
// (reported, not scored: the engine's too-short rule silences them and the owner has not ruled on them).
// Spec labels written from the product rules (worker-written, NOT owner-verified). Never trained on.
const fs = require('fs'), path = require('path');
const { OWN } = require('../../teacher/engine.cjs');
const OUT = path.join(__dirname, '..', 'out-v21'); fs.mkdirSync(OUT, { recursive: true });
const OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
const v2 = fs.readFileSync(path.join(__dirname, '..', 'out-v2', 'adversarial-v2.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const ext = { name: 'Rachel Green', email: 'rachel@umbrella.io' }, extHe = { name: 'הילה שמש', email: 'hila@acme.co.il' };
const N = [ // id, surface, body, att, expect, kind, opts{to,cc,subject}
  ['b-en-confirm', 'gmail', 'Can you confirm the headcount for the offsite by Thursday?', 0, 'draft', 'bare-ask'],
  ['b-en-approve', 'outlook', 'Pls approve the Q4 hiring plan by Friday', 0, 'draft', 'bare-ask'],
  ['b-en-getback', 'gmail', 'Get back to me on the renewal terms by Wednesday?', 0, 'draft', 'bare-ask'],
  ['b-en-review', 'outlook', 'Could you review the pricing changes and tell me if they work for you', 0, 'draft', 'bare-ask'],
  ['b-en-lower', 'gmail', 'can you let me know by tomorrow if the pilot is a go?', 0, 'draft', 'bare-ask'],
  ['b-en-meet', 'gmail', 'Can we meet Monday at 10:00 to go over the renewal?', 0, 'calendar', 'bare-meeting'],
  ['b-en-call', 'gmail', 'Free for a call Tuesday at 3pm about the launch?', 0, 'calendar', 'bare-meeting'],
  ['b-en-drive', 'gmail', 'Pls save the attached deck to Drive', 1, 'file_save', 'bare-save'],
  ['b-en-onedrive', 'outlook', 'Save the attached SOW to OneDrive please', 1, 'file_save', 'bare-save'],
  ['b-he-approve', 'gmail', 'תאשרי בבקשה את הצעת המחיר עד מחר', 0, 'draft', 'bare-ask'],
  ['b-he-getback', 'outlook', 'תחזור אליי עד יום חמישי לגבי הפיילוט', 0, 'draft', 'bare-ask'],
  ['b-he-confirm', 'gmail', 'תוכל לאשר עד מחר שהתאריך של ההשקה סגור?', 0, 'draft', 'bare-ask'],
  ['b-he-meet', 'gmail', 'אפשר שיחה ביום שני ב-14:30 לגבי ההשקה?', 0, 'calendar', 'bare-meeting'],
  ['b-he-drive', 'gmail', 'תשמור את הקובץ המצורף בדרייב', 1, 'file_save', 'bare-save'],
  ['b-he-onedrive', 'outlook', 'לשמור את המצורף ב-OneDrive בבקשה', 1, 'file_save', 'bare-save'],
  ['b-he-rlm', 'gmail', '\u200fתוכלי לאשר את סדר היום לפגישה עד מחר?', 0, 'draft', 'bare-format'],
  ['s-en-thanks', 'gmail', 'Thanks, got it', 0, 'SILENT', 'bare-ack'],
  ['s-en-sounds', 'outlook', 'Sounds good, will do', 0, 'SILENT', 'bare-ack'],
  ['s-en-dont', 'gmail', "Don't send the deck to the client yet", 0, 'SILENT', 'bare-negation'],
  ['s-en-nopay', 'outlook', 'No need to pay the $450, it was credited', 0, 'SILENT', 'bare-negation'],
  ['s-en-nosave', 'gmail', "Don't save the attachment to Drive", 1, 'SILENT', 'bare-negation'],
  ['s-en-fyi', 'gmail', 'FYI the signed NDA is attached', 1, 'SILENT', 'bare-fyi'],
  ['s-en-paid', 'outlook', 'Paid the $1,200 invoice yesterday', 0, 'SILENT', 'bare-past'],
  ['s-en-cancel', 'gmail', 'Tuesday 3pm sync is cancelled', 0, 'SILENT', 'bare-cancelled'],
  ['s-en-hedge', 'gmail', 'Maybe save it to Drive at some point, no rush', 1, 'SILENT', 'bare-hedge'],
  ['s-en-other', 'gmail', 'Dana, can you confirm the budget numbers by Thursday?', 0, 'SILENT', 'bare-addressed-to-other', { to: ['dana@umbrella.io', 'SELF'] }],
  ['s-en-cc', 'outlook', 'Please confirm the headcount by Friday', 0, 'SILENT', 'bare-cc-only', { to: ['avi@umbrella.io'], cc: ['SELF'] }],
  ['s-en-gmail-od', 'gmail', 'Save this to OneDrive pls', 1, 'SILENT', 'bare-gmail-onedrive'],
  ['s-en-mkt', 'gmail', '50% off all plans this week only - shop now', 0, 'SILENT', 'bare-marketing'],
  ['s-he-thanks', 'gmail', 'תודה, קיבלתי', 0, 'SILENT', 'bare-ack'],
  ['s-he-dont', 'outlook', 'אל תשלח את המצגת ללקוח עדיין', 0, 'SILENT', 'bare-negation'],
  ['s-he-fyi', 'gmail', 'לידיעתך, החוזה החתום מצורף', 1, 'SILENT', 'bare-fyi'],
  ['s-he-paid', 'gmail', 'שילמתי את החשבונית אתמול', 0, 'SILENT', 'bare-past'],
  ['s-he-cancel', 'outlook', 'הפגישה ביום שלישי מבוטלת', 0, 'SILENT', 'bare-cancelled'],
  ['s-he-other', 'gmail', 'נועה, תוכלי לאשר את התקציב עד יום חמישי?', 0, 'SILENT', 'bare-addressed-to-other', { to: ['noa@acme.co.il', 'SELF'] }],
  ['s-he-hedge', 'gmail', 'אולי כדאי לשמור את המצורף בדרייב, לא דחוף', 1, 'SILENT', 'bare-hedge'],
  ['s-he-mkt', 'gmail', 'וובינר ביום שלישי ב-10:00 – הירשמו עכשיו', 0, 'SILENT', 'bare-marketing'],
  ['a-en-subj', 'gmail', '', 0, 'AMBIGUOUS', 'subject-only', { subject: 'Can you confirm the headcount by Thursday?' }],
  ['a-he-subj', 'gmail', 'תודה', 0, 'AMBIGUOUS', 'subject-only', { subject: 'תאשרי את הצעת המחיר עד מחר' }],
  ['a-en-file', 'gmail', 'Send me the signed lease by Friday', 0, 'AMBIGUOUS', 'file-chain (search+attach owns it)']
];
const rows = v2.concat(N.map(([id, surface, body, att, expect, kind, o]) => {
  o = o || {}; const own = OWN[surface]; const he = /[\u0590-\u05FF]/.test(body + (o.subject || ''));
  const sub = (l) => (l || []).map((x) => (x === 'SELF' ? own : x));
  return { id: 'adv21-' + id, provenance: 'adversarial-spec-v21', ownerVerified: false, set: 'v21', lang: he ? 'he' : 'en', kind, surface, direction: 'inbound', from: he ? extHe : ext,
    to: o.to ? sub(o.to) : [own], cc: sub(o.cc), ownNames: OWN_NAMES, subject: o.subject || '', body, attachmentCount: att, expect,
    reference: { label: expect, show: expect !== 'SILENT' && expect !== 'AMBIGUOUS', source: 'adversarial-spec', ruleCorrected: [], ownerVerified: false } };
}));
fs.writeFileSync(path.join(OUT, 'adversarial-v21.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log('adversarial-v21', rows.length, '(v2', v2.length, '+ v21 bare', N.length + ')');
