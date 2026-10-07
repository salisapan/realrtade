'use strict';
// Encodes the 22 corpus rows of specs/suggest-save.md §6/§7 as rule inputs + expected outputs -> corpus-22.json (shared by the JS and
// Python tests). Rows marked "either" (13, 14) are encoded for BOTH surfaces; a row passes only if every variant passes.
const fs = require('fs'), path = require('path');
const K = 1024;
const pdf = (id, name, size) => ({ id, name, contentType: 'application/pdf', size: size || 240 * K, isInline: false, contentId: null, kind: 'file' });
const base = (o) => Object.assign({ surface: 'outlook', direction: 'inbound', senderIsUser: false, isDraft: false, inSent: false, consent: true, attachmentsRead: true,
  attachments: [], bodyCids: [], headers: { listUnsubscribe: null, precedence: null }, text: '', subject: '', judgment: { reason: 'intent-null', explicit: null, marketing: false },
  messageId: 'msg-' + o.row, savedFileIds: [], dismissed: [], uploadLimitBytes: null }, o.input);
const row1 = { attachments: [pdf('a1', 'Q3-report.pdf', 240 * K)], text: 'Hi, attached is the Q3 report. Thanks' };
const R = [
  [1, 'Outlook, 1 PDF (Q3-report.pdf, 240KB)', row1, { suggest: true, reason: 'suggest:show', count: 1, target: 'onedrive', en: 'Save Q3-report.pdf to OneDrive?', names: ['Q3-report.pdf'] }],
  [2, 'Outlook, 2 PDFs', { attachments: [pdf('a1', 'Q3-report.pdf'), pdf('a2', 'Q3-appendix.pdf', 180 * K)], text: 'Hi, attached is the Q3 report. Thanks' },
    { suggest: true, reason: 'suggest:show', count: 2, target: 'onedrive', en: 'Save 2 files to OneDrive?', he: 'לשמור 2 קבצים ב-OneDrive?' }],
  [3, 'Outlook, image001.png inline only', { attachments: [{ id: 'i1', name: 'image001.png', contentType: 'image/png', size: 6 * K, isInline: true, contentId: 'image001.png@01DB1A2B.3C4D5E60', kind: 'file' }],
    bodyCids: ['image001.png@01DB1A2B.3C4D5E60'], text: 'Thanks, Dana' }, { suggest: false, reason: 'suggest:no-files' }],
  [4, 'Outlook, image001.png 8KB non-inline', { attachments: [{ id: 'i1', name: 'image001.png', contentType: 'image/png', size: 8 * K, isInline: false, contentId: null, kind: 'file' }], text: 'Thanks, Dana' },
    { suggest: false, reason: 'suggest:no-files' }],
  [5, 'Outlook, invite.ics only', { attachments: [{ id: 'c1', name: 'invite.ics', contentType: 'text/calendar', size: 3 * K, isInline: false, contentId: null, kind: 'file' }], text: 'See you Tuesday' },
    { suggest: false, reason: 'suggest:no-files' }],
  [6, 'Outlook, 1 PDF, refusal', { attachments: [pdf('a1', 'Q3-report.pdf')], text: "Hi, Please don't save the attachment to OneDrive. Thanks" }, { suggest: false, reason: 'suggest:negated' }],
  [7, 'Outlook, 1 PDF, meeting ask (explicit card wins)', { attachments: [pdf('a1', 'Q3-report.pdf')], text: 'Can we meet Tuesday at 10:00 to go over it?', judgment: { reason: 'show', explicit: { step: 'calendar' }, marketing: false } },
    { suggest: false, reason: 'suggest:other-card' }],
  [8, 'Outlook, 1 PDF, explicit OneDrive save (n=1 keeps #103)', { attachments: [pdf('a1', 'Q3-report.pdf')], text: 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks',
    judgment: { reason: 'show', explicit: { step: 'file_save' }, marketing: false } }, { suggest: false, reason: 'suggest:other-card' }],
  [9, 'Outlook, 2 PDFs, explicit save n>=2 becomes the chip', { attachments: [pdf('a1', 'Q3-report.pdf'), pdf('a2', 'Q3-appendix.pdf', 180 * K)], text: 'Please save the attachments to OneDrive',
    judgment: { reason: 'show', explicit: { step: 'file_save' }, marketing: false } }, { suggest: true, reason: 'suggest:show', count: 2, target: 'onedrive', en: 'Save 2 files to OneDrive?', mode: 'explicit-multi' }],
  [10, 'Gmail, 1 PDF, HE', { surface: 'gmail', attachments: [pdf('g1', 'דוח-רבעוני.pdf', 310 * K)], text: 'מצורף הדוח הרבעוני' },
    { suggest: true, reason: 'suggest:show', count: 1, target: 'drive', he: 'לשמור את דוח-רבעוני.pdf ב-Drive?' }],
  [11, 'Gmail, 1 PDF, names OneDrive', { surface: 'gmail', attachments: [pdf('g1', 'Q3-report.pdf')], text: 'Please save the attachment to OneDrive' }, { suggest: false, reason: 'suggest:onedrive-target-on-gmail' }],
  [12, 'Gmail, 1 PDF, HE refusal', { surface: 'gmail', attachments: [pdf('g1', 'Q3-report.pdf')], text: 'אל תשמור את הקובץ המצורף' }, { suggest: false, reason: 'suggest:negated' }],
  [13, 'either, 1 PDF, mail sent by the user', { direction: 'outbound', senderIsUser: true, inSent: true, attachments: [pdf('a1', 'Q3-report.pdf')], text: 'Hi Dana, attached is the Q3 report.' },
    { suggest: false, reason: 'suggest:not-inbound' }, ['outlook', 'gmail']],
  [14, 'either, brochure.pdf + List-Unsubscribe', { attachments: [pdf('b1', 'brochure.pdf', 1800 * K)], headers: { listUnsubscribe: '<mailto:unsub@news.example.com>', precedence: null }, text: 'Join our webinar' },
    { suggest: false, reason: 'suggest:bulk' }, ['outlook', 'gmail']],
  [15, 'Outlook, attachments read fails', { attachmentsRead: false, attachments: null, text: 'Hi, attached is the Q3 report' }, { suggest: false, reason: 'suggest:attachments-unread' }],
  [16, 'Outlook, itemAttachment only', { attachments: [{ id: 'm1', name: 'RE: Budget.msg', contentType: null, size: 54 * K, isInline: false, contentId: null, kind: 'item' }], text: 'FYI see below' },
    { suggest: false, reason: 'suggest:no-files' }],
  [17, 'Outlook, smime.p7s only', { attachments: [{ id: 's1', name: 'smime.p7s', contentType: 'application/pkcs7-signature', size: 5 * K, isInline: false, contentId: null, kind: 'file' }], text: 'Thanks' },
    { suggest: false, reason: 'suggest:no-files' }],
  [18, 'Outlook, row 1 after [Not now] + reload', Object.assign({}, row1, { messageId: 'msg-1', dismissed: ['msg-1'] }), { suggest: false, reason: 'suggest:dismissed' }],
  [19, 'Outlook, row 1 after Save + reload (ProofOfClose exists)', Object.assign({}, row1, { messageId: 'msg-1', savedFileIds: ['a1'] }), { suggest: false, reason: 'suggest:already-saved' }],
  [20, 'Outlook, scan.jpg 1.2MB non-inline', { attachments: [{ id: 'j1', name: 'scan.jpg', contentType: 'image/jpeg', size: 1.2 * 1024 * K, isInline: false, contentId: null, kind: 'file' }], text: 'Scan attached.' },
    { suggest: true, reason: 'suggest:show', count: 1, target: 'onedrive', names: ['scan.jpg'] }],
  [21, 'Gmail, from noreply@, invoice.pdf, no List-Unsubscribe', { surface: 'gmail', attachments: [pdf('g1', 'invoice.pdf', 96 * K)], text: 'Your invoice for October is attached.', subject: 'Your invoice' },
    { suggest: true, reason: 'suggest:show', count: 1, target: 'drive', names: ['invoice.pdf'] }],
  [22, 'Outlook, 1 PDF, OneDrive box not checked', { consent: false, attachments: [pdf('a1', 'Q3-report.pdf')], text: 'Hi, attached is the Q3 report. Thanks' }, { suggest: false, reason: 'suggest:no-consent' }]
];
const out = [];
for (const [row, desc, input, expect, surfaces] of R) for (const s of surfaces || [null]) {
  const inp = base({ row, input: Object.assign({}, input, s ? { surface: s } : {}) });
  out.push({ row, variant: s, desc, input: inp, expect });
}
fs.writeFileSync(path.join(__dirname, 'corpus-22.json'), JSON.stringify(out, null, 1) + '\n');
console.log('rows', new Set(out.map((x) => x.row)).size, 'cases', out.length);
// ---- extra edge cases (not spec rows): same base input, one change each
const X = [
  ['x01 doc with a cid the body references (inline-by-cid)', { attachments: [Object.assign(pdf('a1', 'terms.pdf'), { contentId: 'terms@x' })], bodyCids: ['terms@x'] }, 'suggest:no-files'],
  ['x02 doc with an unreferenced Content-ID (Gmail parts often carry one)', { surface: 'gmail', attachments: [Object.assign(pdf('a1', 'terms.pdf'), { contentId: '<f_abc>' })] }, 'suggest:show'],
  ['x03 png 300KB but has a cid', { attachments: [{ id: 'p', name: 'photo.png', contentType: 'image/png', size: 300 * K, isInline: false, contentId: 'ii_1', kind: 'file' }] }, 'suggest:no-files'],
  ['x04 Outlook-*.png 300KB', { attachments: [{ id: 'p', name: 'Outlook-abc123.png', contentType: 'image/png', size: 300 * K, isInline: false, contentId: null, kind: 'file' }] }, 'suggest:no-files'],
  ['x05 jpg 60KB (under 100KB)', { attachments: [{ id: 'p', name: 'receipt.jpg', contentType: 'image/jpeg', size: 60 * K, isInline: false, contentId: null, kind: 'file' }] }, 'suggest:no-files'],
  ['x06 gif 500KB (not in image allowlist)', { attachments: [{ id: 'p', name: 'anim.gif', contentType: 'image/gif', size: 500 * K, isInline: false, contentId: null, kind: 'file' }] }, 'suggest:no-files'],
  ['x07 1KB txt (under 2KB)', { attachments: [{ id: 't', name: 'note.txt', contentType: 'text/plain', size: 1024, isInline: false, contentId: null, kind: 'file' }] }, 'suggest:no-files'],
  ['x08 winmail.dat + vcf + referenceAttachment', { attachments: [{ id: 'w', name: 'winmail.dat', contentType: 'application/ms-tnef', size: 40 * K, kind: 'file' }, { id: 'v', name: 'dana.vcf', contentType: 'text/vcard', size: 3 * K, kind: 'file' }, { id: 'r', name: 'Budget.xlsx', size: 0, kind: 'reference' }] }, 'suggest:no-files'],
  ['x09 zip 2MB (not in allowlist)', { attachments: [{ id: 'z', name: 'files.zip', contentType: 'application/zip', size: 2048 * K, kind: 'file' }] }, 'suggest:no-files'],
  ['x10 Precedence: bulk without List-Unsubscribe', { headers: { listUnsubscribe: null, precedence: 'bulk' } }, 'suggest:bulk'],
  ['x11 engine quiet:noise', { judgment: { reason: 'quiet:noise', explicit: null, marketing: false } }, 'suggest:bulk'],
  ['x12 noreply sender alone does not block', { surface: 'gmail', subject: 'Receipt', text: 'Thanks for your payment. Receipt attached.' }, 'suggest:show'],
  ['x13 too large: every file over the upload limit', { uploadLimitBytes: 4 * 1024 * K, attachments: [pdf('a1', 'big.pdf', 30 * 1024 * K)] }, 'suggest:too-large'],
  ['x14 too large: one of two dropped, chip for the other', { uploadLimitBytes: 4 * 1024 * K, attachments: [pdf('a1', 'big.pdf', 30 * 1024 * K), pdf('a2', 'small.pdf', 90 * K)] }, 'suggest:show', 1],
  ['x15 explicit save n=1 + an inline logo (still n=1 real file)', { judgment: { reason: 'show', explicit: { step: 'file_save' }, marketing: false }, attachments: [pdf('a1', 'contract.pdf'), { id: 'i', name: 'image001.png', contentType: 'image/png', size: 5 * K, isInline: true, contentId: 'image001', kind: 'file' }] }, 'suggest:other-card'],
  ['x16 explicit reply draft + 2 PDFs', { judgment: { reason: 'show', explicit: { step: 'draft' }, marketing: false }, attachments: [pdf('a1', 'a.pdf'), pdf('a2', 'b.pdf')] }, 'suggest:other-card'],
  ['x17 one of two already saved -> chip for the other', { savedFileIds: ['a1'], attachments: [pdf('a1', 'a.pdf'), pdf('a2', 'b.pdf')] }, 'suggest:show', 1],
  ['x18 Outlook mail names Google Drive', { text: 'Please save the attachment to Google Drive' }, 'suggest:drive-target-on-outlook'],
  ['x19 HE "אין צורך לשמור"', { text: 'אין צורך לשמור את זה, רק לידיעתך' }, 'suggest:negated'],
  ['x20 HE "לא לשמור"', { text: 'בבקשה לא לשמור בדרייב' , surface: 'gmail' }, 'suggest:negated'],
  ['x21 draft (not sent) by someone else in Drafts', { isDraft: true }, 'suggest:not-inbound'],
  ['x22 attachments read but list empty (hasAttachments was true)', { attachments: [] }, 'suggest:no-files'],
  ['x23 marketing words in body, no header', { text: 'Exclusive offer: 30% off, register now' }, 'suggest:bulk'],
  ['x24 file with no size', { attachments: [{ id: 'a', name: 'x.pdf', contentType: 'application/pdf', kind: 'file' }] }, 'suggest:no-files'],
  ['x25 dismissed via Undo key (not message id)', { dismissed: ['msg-x|a1'] , messageId: 'msg-x' }, 'suggest:dismissed'],
  ['x26 names a shared location as the target', { text: 'Attached is the CV. Please save it to our shared files by October 15.' }, 'suggest:other-target'],
  ['x27 SharePoint target, HE surface Gmail', { surface: 'gmail', text: 'תעלה את הקובץ לשרפוינט בבקשה' }, 'suggest:other-target'],
  ['x28 engine handed the mail to the file chain', { judgment: { reason: 'file', explicit: null, marketing: false } }, 'suggest:other-card'],
  ['x30 "you don\'t need to save" (core SAVE_NO misses it)', { text: "You don't need to save the attachment. Regards" }, 'suggest:negated'],
  ['x31 HE upload refusal "אל תעלי את המצורף"', { text: 'אל תעלי את המצורף ל-OneDrive' }, 'suggest:negated'],
  ['x29 engine waits on a Drive lookup', { surface: 'gmail', judgment: { reason: 'google-wait(drive-lookup)', explicit: null, marketing: false } }, 'suggest:other-card']
];
const xs = X.map(([desc, input, reason, count]) => ({ desc, input: base({ row: 'x', input: Object.assign({ attachments: [pdf('a1', 'Q3-report.pdf')], text: 'Hi, attached is the Q3 report. Thanks' }, input) }), expect: Object.assign({ reason }, count ? { count } : {}) }));
fs.writeFileSync(path.join(__dirname, 'cases-extra.json'), JSON.stringify(xs, null, 1) + '\n');
console.log('extra cases', xs.length);
