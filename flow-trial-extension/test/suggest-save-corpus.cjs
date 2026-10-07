// Suggest-save engine. Eligibility and the writer. No chip is drawn.
// Run: node test/suggest-save-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowSuggestSave: S } = require('../core/suggest-save.js');
const engine = { console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'quiet-metrics.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const KB = 1024;
function file(over) {
  return Object.assign({
    id: 'a', name: 'Q3-report.pdf', size: 240 * KB, contentType: 'application/pdf', isInline: false
  }, over || {});
}
function mail(over) {
  return Object.assign({
    surface: 'outlook', inbound: true, messageId: 'M1',
    text: 'Hi, attached is the Q3 report. Thanks',
    attachments: [file()], consent: true
  }, over || {});
}
const NOW = new Date('2026-10-07T12:00:00Z');
function judge(text, count, surface) {
  return J.judge({
    text: text, subject: 'Gate', surface: surface || 'outlook', now: NOW,
    sender: { name: 'Flow', email: 'ai.local.flow@gmail.com' },
    attachmentCount: count, hasThreadAttachment: count === 1
  });
}

console.log('\n--- rows 1-22 ---\n');
{
  const r1 = S.suggestSave(mail());
  check('1 one PDF is an OneDrive step, hidden',
    r1.eligible === true && r1.target === 'onedrive' && r1.reason === 'suggest:eligible-hidden' &&
    r1.fileCount === 1 && r1.step && r1.step.kind === 'attachmentSave' && r1.step.params.target === 'onedrive' &&
    r1.step.params.files.length === 1 && r1.step.copy && r1.step.copy.en === 'Save Q3-report.pdf to OneDrive?' &&
    r1.step.copy.he === 'לשמור את Q3-report.pdf ב-OneDrive?');

  const r2 = S.suggestSave(mail({ attachments: [file({ id: 'a' }), file({ id: 'b', name: 'Q4.pdf' })] }));
  check('2 two PDFs stay eligible',
    r2.eligible === true && r2.fileCount === 2 && r2.target === 'onedrive' &&
    r2.step.copy.en === 'Save 2 files to OneDrive?' && r2.step.copy.he === 'לשמור 2 קבצים ב-OneDrive?' &&
    r2.step.copy.names[0] === 'Q3-report.pdf' && r2.step.copy.names[1] === 'Q4.pdf');

  check('3 inline image is not a file', S.suggestSave(mail({
    attachments: [file({ name: 'image001.png', size: 80 * KB, isInline: true, contentType: 'image/png' })]
  })).reason === 'suggest:no-files');

  check('4 a small image001 is not a file', S.suggestSave(mail({
    attachments: [file({ name: 'image001.png', size: 8 * KB, contentType: 'image/png' })]
  })).reason === 'suggest:no-files');

  check('5 an invite is not a file', S.suggestSave(mail({
    attachments: [file({ name: 'invite.ics', contentType: 'text/calendar' })]
  })).reason === 'suggest:no-files');

  check('6 a refusal is suggest:negated', S.suggestSave(mail({
    text: "Please don't save the attachment to OneDrive"
  })).reason === 'suggest:negated');

  const meet = 'Can we meet Tuesday at 10:00 to go over it?';
  const r7 = S.suggestSave(mail({ text: meet, otherCard: true }));
  const j7 = judge(meet, 1, 'gmail');
  const kinds7 = j7.process && j7.process.steps && j7.process.steps.map((s) => s.kind);
  check('7 another card wins, and the meeting card still shows',
    r7.reason === 'suggest:other-card' && r7.step === null && j7.show === true && kinds7 && kinds7[0] === 'calendar',
    { suggest: r7.reason, show: j7.show, reason: j7.reason, kinds: kinds7 });

  const one = 'Please save the attachment to OneDrive by Friday, October 9';
  const r8 = S.suggestSave(mail({ text: one }));
  const j8 = judge(one, 1);
  const kinds8 = j8.process && j8.process.steps && j8.process.steps.map((s) => s.kind);
  check('8 explicit one file stays the OneDrive card',
    r8.reason === 'suggest:other-card' && r8.eligible === false && j8.show === true && kinds8 && kinds8[0] === 'onedriveFile',
    { suggest: r8.reason, show: j8.show, kinds: kinds8 });

  const twoAsk = 'Please save the attachments to OneDrive';
  const r9 = S.suggestSave(mail({
    text: twoAsk,
    attachments: [file({ id: 'a' }), file({ id: 'b', name: 'other.pdf' })]
  }));
  const j9 = judge(twoAsk, 2);
  check('9 two explicit files stay silent on the card and eligible underneath',
    r9.eligible === true && r9.fileCount === 2 && j9.show !== true, { show: j9.show, reason: j9.reason, suggest: r9.reason });

  const r10 = S.suggestSave(mail({ surface: 'gmail', text: 'מצורף הדוח הרבעוני' }));
  check('10 Gmail Hebrew report targets Drive', r10.eligible === true && r10.target === 'drive');

  const r11 = S.suggestSave(mail({ surface: 'gmail', text: 'Please save the attachment to OneDrive' }));
  check('11 Gmail that names OneDrive does not offer Drive',
    r11.eligible === false && r11.reason === 'suggest:onedrive-target-on-gmail' && r11.step === null);

  check('12 Hebrew refusal is suggest:negated', S.suggestSave(mail({
    surface: 'gmail', text: 'אל תשמור את הקובץ המצורף'
  })).reason === 'suggest:negated');

  check('13 mail the person sent is not inbound', S.suggestSave(mail({ inbound: false })).reason === 'suggest:not-inbound');

  check('14 List-Unsubscribe is bulk', S.suggestSave(mail({
    text: 'The brochure is attached.',
    attachments: [file({ name: 'brochure.pdf' })],
    headers: { 'List-Unsubscribe': '<mailto:off@lists.example>' }
  })).reason === 'suggest:bulk');

  check('15 an unread list is not guessed', S.suggestSave(mail({ attachments: null })).reason === 'suggest:attachments-unread');

  check('16 an attached message is not a file', S.suggestSave(mail({
    attachments: [{ id: 'm', name: 'Forwarded', size: 20 * KB, '@odata.type': '#microsoft.graph.itemAttachment' }]
  })).reason === 'suggest:no-files');

  check('17 smime is not a file', S.suggestSave(mail({
    attachments: [file({ name: 'smime.p7s', contentType: 'application/pkcs7-signature' })]
  })).reason === 'suggest:no-files');

  const kept = [file()];
  const dismissed = S.dismiss({}, 'M1', kept);
  check('18 Not now is suggest:dismissed', S.suggestSave(mail({ dismissals: dismissed })).reason === 'suggest:dismissed');

  const proofLog = [{
    kind: 'written', messageId: 'M1', suggestKey: S.dismissalKey('M1', kept),
    fetchedBack: true, files: kept
  }];
  check('19 a proved save is suggest:already-saved',
    S.suggestSave(mail({ log: proofLog })).reason === 'suggest:already-saved');

  check('20 a large scan photo is eligible', S.suggestSave(mail({
    attachments: [file({ name: 'scan.jpg', size: Math.round(1.2 * 1024 * KB), contentType: 'image/jpeg' })]
  })).eligible === true);

  const r21 = S.suggestSave(mail({
    surface: 'gmail',
    text: 'Your invoice is attached.',
    attachments: [file({ name: 'invoice.pdf' })],
    headers: { from: 'noreply@shop.example' }
  }));
  check('21 noreply alone does not block', r21.eligible === true && r21.target === 'drive' && r21.reason === 'suggest:eligible-hidden');

  check('22 no OneDrive consent is suggest:no-consent', S.suggestSave(mail({ consent: false })).reason === 'suggest:no-consent');

  check('a missing consent is suggest:no-consent', S.suggestSave(mail({ consent: null })).reason === 'suggest:no-consent');

  check('you don\'t need to save is suggest:negated', S.suggestSave(mail({
    text: "You don't need to save the attachment"
  })).reason === 'suggest:negated');

  check('Hebrew upload refusal is suggest:negated', S.suggestSave(mail({
    text: 'אל תעלי את המצורף ל-OneDrive'
  })).reason === 'suggest:negated');

  const oracleRow = JSON.parse(fs.readFileSync(path.join(__dirname, 'oracle/suggest-save/corpus-22.json'), 'utf8'))[0];
  const decided = S.decide(oracleRow.input);
  const named = S.suggestSave(oracleRow.input);
  check('spec §9 names the file; the oracle chip still says Save file to',
    decided.reason === 'suggest:show' && decided.chip && decided.chip.en === 'Save file to OneDrive?' &&
    named.reason === 'suggest:eligible-hidden' && named.step.copy.en === 'Save Q3-report.pdf to OneDrive?' &&
    named.step.copy.he === 'לשמור את Q3-report.pdf ב-OneDrive?');
}

console.log('\n--- writer ---\n');
(async () => {
  const files = [file({ id: 'a' }), file({ id: 'b', name: 'other.pdf' })];
  const partial = await S.saveAttachments(files, 'onedrive', {
    writeOne: async (f) => (f.id === 'a'
      ? { ok: true, ref: { fileId: 'A', created: true }, proof: { fetchedBack: true, externalId: 'A', system: 'microsoft/onedrive' } }
      : { ok: false, reason: 'verify_failed' })
  });
  check('one of two fetched back says Saved 1 of 2 and undo lists the created file',
    partial.line === 'Saved 1 of 2' && partial.undo.length === 1 && partial.handled === false && partial.proofs.length === 1,
    partial);

  const both = await S.saveAttachments(files, 'onedrive', {
    writeOne: async (f) => ({ ok: true, ref: { fileId: f.id, created: true }, proof: { fetchedBack: true, externalId: f.id } })
  });
  check('every file fetched back is handled', both.handled === true && both.proofs.length === 2 && both.undo.length === 2);

  const keptOld = await S.saveAttachments([file()], 'onedrive', {
    writeOne: async () => ({ ok: true, ref: { fileId: 'OLD', created: false }, proof: { fetchedBack: true, externalId: 'OLD' } })
  });
  check('undo does not delete a file this write did not create', keptOld.undo.length === 0 && keptOld.handled === true);

  const undone = await S.undoSaved(partial.undo.concat([{ fileId: 'SKIP', created: false }]), {
    undoOne: async () => ({ ok: true })
  });
  check('undo deletes only the created ref', undone.deleted === 1 && undone.results.length === 1);

console.log('\n--- nothing is drawn ---\n');
{
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  const outlook = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  check('no Save / Not now chip in the pages',
    gmail.indexOf('Not now') < 0 && outlook.indexOf('Not now') < 0 &&
    gmail.indexOf('flow-suggest') < 0 && outlook.indexOf('flow-suggest') < 0);
  check('the page records the decision and does not send it',
    outlook.indexOf('recordSuggestNote') > 0 && outlook.indexOf("reason: 'suggest:other-card'") > 0 &&
    outlook.indexOf('attachmentSave') < 0);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
})();
