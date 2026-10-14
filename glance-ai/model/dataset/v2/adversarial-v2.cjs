'use strict';
// adversarial-v2 = v1's 41 spec cases + v2 cases (HE no-action FYI, positive "נדרשת פעולה:", colleague-addressed / Cc-only,
// owner-addressed controls, Gmail OneDrive target, conditional, HE webinar, format noise, typos, mixed HE/EN).
// Addressing / format / typo probes use NON-file asks (a 'send me <file>' ask belongs to the file chain, which this harness
// does not run), so they test what they claim to test.
// Spec labels from the hard product rules (worker-written, NOT owner-verified). Never trained on.
// Also converts the OSS worker's eval set (read-only) into dataset/out-v2/oss-eval.jsonl (binary gold act/silence).
const fs = require('fs'), path = require('path');
const { OWN } = require('../../teacher/engine.cjs');
const OUT = path.join(__dirname, '..', 'out-v2');
const OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
const v1 = fs.readFileSync(path.join(__dirname, '..', 'out', 'adversarial.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  .map((r) => Object.assign({}, r, { cc: [], ownNames: OWN_NAMES, set: 'v1', teacher: undefined }));
const ext = { name: 'Tom Baker', email: 'tom@hooli.xyz' }, extHe = { name: 'יוסי אברהם', email: 'yossi@initech.co.il' };
const N = [ // id, surface, body, att, expect, kind, opts{to,cc,subject}
  ['he-fyi-noact-1', 'gmail', 'לידיעתך, מצורף החוזה החתום. לא נדרשת פעולה.', 1, 'SILENT', 'he-no-action'],
  ['he-fyi-noact-2', 'outlook', 'מצורף דוח ההוצאות לתיעוד, לא נדרש ממך דבר', 1, 'SILENT', 'he-no-action'],
  ['he-fyi-noact-3', 'gmail', 'עדכון: הפיילוט הסתיים בהצלחה ביום חמישי. לא נדרש ממך כלום.', 0, 'SILENT', 'he-no-action'],
  ['he-fyi-noact-4', 'gmail', 'היי,\n\nשולחת את הצעת המחיר לעיונך – אין צורך בפעולה.\n\nתודה,\nדנה', 1, 'SILENT', 'he-no-action'],
  ['he-pos-action-1', 'gmail', 'נדרשת פעולה: נא לחתום על הסכם הסודיות עד יום חמישי.', 0, 'draft', 'he-positive-action'],
  ['he-pos-action-2', 'gmail', 'נדרשת פעולה מצדך: לאשר את התקציב לרבעון עד מחר.', 0, 'draft', 'he-positive-action'],
  ['to-other-en', 'gmail', 'Hi Dana,\n\nCould you confirm the budget numbers by Thursday?\n\nThanks,\nTom', 0, 'SILENT', 'addressed-to-other', { to: ['dana@acme.io', 'SELF'] }],
  ['to-other-he', 'gmail', 'היי נועה,\nתוכלי לאשר את התקציב לרבעון עד יום חמישי?\nתודה,\nיוסי', 0, 'SILENT', 'addressed-to-other', { to: ['noa@acme.co.il', 'SELF'] }],
  ['to-other-inline', 'outlook', 'Maya, can you review the pricing sheet and confirm by Friday?', 0, 'SILENT', 'addressed-to-other', { to: ['maya@acme.io', 'SELF'] }],
  ['cc-only-en', 'gmail', 'Hi,\nPlease send the W-9 form by Friday.\nThanks', 0, 'SILENT', 'cc-only', { to: ['dana@acme.io'], cc: ['SELF'] }],
  ['cc-only-he', 'outlook', 'שלום,\nנא להעביר את אישור הביטוח עד יום ראשון.\nבברכה', 0, 'SILENT', 'cc-only', { to: ['avi@acme.co.il'], cc: ['SELF'] }],
  ['to-own-en', 'gmail', 'Hi Sali,\n\nCould you confirm the budget numbers by Thursday?\n\nThanks,\nTom', 0, 'draft', 'owner-addressed'],
  ['to-own-he', 'gmail', 'סאלי, תוכלי לאשר את התקציב לרבעון עד יום חמישי?', 0, 'draft', 'owner-addressed'],
  ['to-own-cc', 'gmail', 'Sali, could you approve the budget by Friday?', 0, 'draft', 'owner-addressed', { to: ['dana@acme.io'], cc: ['SELF'] }],
  ['to-none-en', 'outlook', 'Hi,\n\nCan you confirm whether we can start the pilot on Wednesday?\n\nBest,\nTom', 0, 'draft', 'no-name-control'],
  ['gmail-od-1', 'gmail', 'Please save the attached file to OneDrive.', 1, 'SILENT', 'gmail-onedrive'],
  ['gmail-od-he', 'gmail', 'תשמרי את המצורף בוואן דרייב', 1, 'SILENT', 'gmail-onedrive'],
  ['outlook-od-he', 'outlook', 'תשמרי בבקשה את הקובץ המצורף בוואן דרייב', 1, 'file_save', 'onedrive'],
  ['cond-he', 'gmail', 'נניח שנאשר ₪40,000 – תוכלו להתחיל ביום ראשון? עדיין לא החלטנו.', 0, 'SILENT', 'conditional'],
  ['cond-en-2', 'gmail', 'Suppose we go with Acme at $2,000 a month, could you start Monday? Nothing decided yet.', 0, 'SILENT', 'conditional'],
  ['mkt-he-2', 'gmail', 'וובינר חינמי: איך לנהל את התקציב – ביום שלישי בשעה 10:00. הירשמו עכשיו', 0, 'SILENT', 'marketing'],
  ['mkt-he-3', 'outlook', 'הזמנה אישית לוובינר על המעבר לענן ביום רביעי ב-14:30', 0, 'SILENT', 'marketing'],
  ['neg-he-pay', 'gmail', 'אל תשלמי את החשבונית, זה זוכה', 0, 'SILENT', 'negation'],
  ['neg-he-send', 'outlook', 'בבקשה אל תעביר את ה-deck ללקוח עדיין', 0, 'SILENT', 'negation'],
  ['fmt-crlf-ask', 'gmail', 'Hi,\r\n\u00a0\r\nCould\u00a0you confirm the budget numbers by Friday?\r\n\r\nThanks,\r\nTom\r\n\r\nSent from my iPhone', 0, 'draft', 'format'],
  ['fmt-rlm-hedge', 'gmail', '\u200fאולי שווה לשמור את זה בדרייב, תחליט אתה', 1, 'SILENT', 'format'],
  ['fmt-rlm-ask', 'gmail', '\u200fתוכל לאשר את התקציב לרבעון עד יום חמישי?', 0, 'draft', 'format'],
  ['fmt-disclaimer', 'gmail', 'FYI, the Q3 report is attached.\n\nCONFIDENTIALITY NOTICE: This e-mail and any attachments are confidential. If you have received it in error, please notify the sender and delete it.', 1, 'SILENT', 'format'],
  ['typo-he-ask', 'gmail', 'תוכל לאשר את התקצב לרבעון עד יום חמישי?', 0, 'draft', 'typo'],
  ['typo-en-ask', 'outlook', 'Could you pleae confirm the budgte numbers by Friday?', 0, 'draft', 'typo'],
  ['mixed-he-ask', 'gmail', 'תוכלי לעשות review ל-deck עד מחר?', 0, 'draft', 'mixed'],
  ['file-ask-he', 'gmail', 'אפשר לשלוח לי את החוזה החתום עד יום חמישי?', 0, 'AMBIGUOUS', 'file-chain (search+attach owns it; not a Do It card in this harness)'],
  ['he-meet', 'gmail', 'אפשר לקבוע שיחה ביום שלישי בשעה 10:00 לגבי הפיילוט?', 0, 'calendar', 'control']
];
const rows = v1.concat(N.map(([id, surface, body, att, expect, kind, o]) => {
  o = o || {}; const own = OWN[surface]; const he = /[\u0590-\u05FF]/.test(body);
  const sub = (l) => (l || []).map((x) => (x === 'SELF' ? own : x));
  return { id: 'adv2-' + id, provenance: 'adversarial-spec-v2', ownerVerified: false, set: 'v2', lang: he ? 'he' : 'en', kind, surface, direction: 'inbound', from: he ? extHe : ext,
    to: o.to ? sub(o.to) : [own], cc: sub(o.cc), ownNames: OWN_NAMES, subject: o.subject || (he ? 'בהמשך לשיחה' : 'Re: follow-up'), body, attachmentCount: att, expect };
}));
for (const r of rows) r.reference = { label: r.expect, show: r.expect !== 'SILENT' && r.expect !== 'AMBIGUOUS', source: 'adversarial-spec', ruleCorrected: [], ownerVerified: false };
fs.writeFileSync(path.join(OUT, 'adversarial-v2.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log('adversarial-v2', rows.length, '(v1', v1.length, '+ v2', N.length + ')');
// OSS worker eval (read-only input)
const ossP = path.join(__dirname, '..', '..', '..', 'oss', 'eval', 'eval.jsonl');
if (fs.existsSync(ossP)) {
  const oss = fs.readFileSync(ossP, 'utf8').trim().split('\n').map(JSON.parse).map((e) => {
    const outbound = e.direction && e.direction !== 'inbound';
    return { id: 'oss-' + e.id, provenance: 'oss-eval:' + e.set, ownerVerified: false, lang: e.lang, scenario: e.category, surface: 'gmail', direction: outbound ? 'outbound' : 'inbound',
      from: outbound ? { name: 'Sali', email: OWN.gmail } : { name: e.fromName || null, email: e.from || null }, to: outbound ? ['contact@partner.example'] : [OWN.gmail], cc: [], ownNames: OWN_NAMES,
      subject: e.subject || '', body: e.body, attachmentCount: /attached|מצורף|מצורפת/i.test(e.body) ? 1 : 0, gold: e.gold.decision === 'act' ? 'act' : 'silence', goldSource: e.goldSource, set: e.set };
  });
  fs.writeFileSync(path.join(OUT, 'oss-eval.jsonl'), oss.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log('oss-eval', oss.length);
}
