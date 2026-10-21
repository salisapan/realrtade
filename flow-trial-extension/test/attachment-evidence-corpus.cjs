// Thread attachment evidence: only an explicit save/attach/sign ask counts.
// Run: node test/attachment-evidence-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowSuggestSave: S } = require('../core/suggest-save.js');

const ROOT = path.join(__dirname, '..');
const engine = { console, FlowSuggestSave: S };
vm.createContext(engine);
for (const f of ['file-attach.js', 'incoming-judge.js', 'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'resolution.js', 'quiet-metrics.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const FA = vm.runInContext('FlowFileAttach', engine);
const J = vm.runInContext('FlowIncomingJudge', engine);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const KB = 1024;
const pdf = { id: 'p1', name: 'invoice.pdf', size: 240 * KB, contentType: 'application/pdf', isInline: false };

console.log('\n--- threadEvidenceEligible ---\n');
check('save attached pdf to Drive', FA.threadEvidenceEligible('Please save the attached pdf to Drive.', 1));
check('signed contract please file it', FA.threadEvidenceEligible('Signed contract attached (184w)\nAttached is the signed contract, please file it.', 1));
check('attachment with no ask', !FA.threadEvidenceEligible('Thanks for the update. See attached invoice.', 1));
check('newsletter pdf noreply', !FA.threadEvidenceEligible('Your monthly statement is attached. Unsubscribe anytime.', 1));
check('self pdf no request', !FA.threadEvidenceEligible('FYI — contract attached for your records.', 1));
check('no attachment', !FA.threadEvidenceEligible('Please save the attached pdf to Drive.', 0));

console.log('\n--- suggest-save quiet without save ask ---\n');
function mail(over) {
  return Object.assign({
    surface: 'gmail', inbound: true, messageId: 'M1', consent: true,
    text: 'Thanks. Invoice attached.', attachments: [pdf], attachmentsRead: true
  }, over || {});
}
check('inbound pdf no save verb', S.suggestSave(mail()).reason === 'suggest:no-save-ask');
check('noreply invoice', S.suggestSave(mail({
  text: 'Your receipt is attached.',
  subject: 'Invoice #8821',
  headers: { precedence: 'bulk', listUnsubscribe: '<mailto:noreply@billing.example>' }
})).reason === 'suggest:bulk' || S.suggestSave(mail({
  text: 'Your receipt is attached.',
  subject: 'Invoice #8821',
  headers: { precedence: 'bulk', listUnsubscribe: '<mailto:noreply@billing.example>' }
})).reason === 'suggest:no-save-ask');

console.log('\n--- incoming judge stays quiet ---\n');
const NOW = new Date('2026-10-07T12:00:00Z').getTime();
function judge(body, subject) {
  return J.judge({
    text: body, subject: subject || 'Attached', surface: 'gmail', now: NOW,
    sender: { name: 'Billing', email: 'noreply@billing.example.com' },
    attachmentCount: 1, hasThreadAttachment: true, inbound: true
  });
}
function judgeQuiet(body, subject, sender) {
  const out = judge(body, subject, sender);
  return out && out.show !== true;
}
check('noreply pdf quiet', judgeQuiet('Your invoice PDF is attached. No reply needed.', 'Invoice'));
check('thanks attached quiet', judgeQuiet('Thanks for the update. See attached.', 'Re: project', { name: 'Dana', email: 'dana@acme.io' }));

console.log('\nFAILURES:', failures);
process.exit(failures ? 1 : 0);
