// Thread attachment pick for file-it / Drive save (Gmail + Outlook share core).
// Run: node test/save-attachment-pick-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowFileAttach: FA } = require('../core/file-attach.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function meta(name, over) {
  return Object.assign({
    filename: name,
    name: name,
    mimeType: 'application/pdf',
    contentType: 'application/pdf',
    url: 'https://mail.google.com/mail/u/0/?ui=2&ik=x&view=att&th=1&attid=0.1&disp=safe&zw',
    size: 120000
  }, over || {});
}

const BODY = 'Attached is the signed contract and the appendix.';
const reversed = [meta('appendix.pdf'), meta('signed-contract.pdf')];
const pickReversed = FA.pickSaveAttachment(BODY, reversed);
check('reversed order picks signed contract', pickReversed.mode === 'picked' && pickReversed.file && pickReversed.file.filename === 'signed-contract.pdf', pickReversed);

const ambiguous = [meta('vendor-memo.pdf'), meta('client-memo.pdf')];
const pickAmb = FA.pickSaveAttachment('Please save the attachment to Drive.', ambiguous);
check('two similar files need a choice', pickAmb.mode === 'choice' && !pickAmb.file, pickAmb);

const single = FA.pickSaveAttachment('Attached is the invoice.', [meta('invoice.pdf')]);
check('one file stays single', single.mode === 'single' && single.file.filename === 'invoice.pdf', single);

const tieBody = 'Attached is the signed copy.';
const tieFiles = [meta('scan-1.pdf'), meta('scan-2.pdf')];
const pickTie = FA.pickSaveAttachment(tieBody, tieFiles);
check('two scans with signed-copy wording need a chooser', pickTie.mode === 'choice' && !pickTie.file, pickTie);

console.log('\n--- Gmail and Outlook pages call pickSaveAttachment ---\n');
const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
const outlook = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
check('Gmail uses pickSaveAttachment at scan', /FlowFileAttach\.pickSaveAttachment/.test(gmail));
check('Gmail shows save file name on card', /flow-chip-save-file/.test(gmail));
check('Gmail save attach chooser on ambiguous', /buildSaveAttachChooser/.test(gmail));
check('Outlook buildCtx uses pickSaveAttachment', /FlowFileAttach\.pickSaveAttachment/.test(outlook));
check('Outlook ctx carries attachmentPickMode', /attachmentPickMode:\s*savePick\.mode/.test(outlook));

console.log('\nFAILURES:', failures);
process.exit(failures ? 1 : 0);
