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

const noUrlId = FA.pickSaveAttachment(BODY, [meta('signed-contract.pdf', { url: '', id: undefined })]);
check('catalog att-N id still resolves by file name on Gmail save path', (noUrlId.mode === 'picked' || noUrlId.mode === 'single') && noUrlId.file && noUrlId.file.filename === 'signed-contract.pdf', noUrlId);

function gmailCatalogPickBlock() {
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  const start = gmail.indexOf("if (!only && Array.isArray(catalog) && catalog.length) {");
  const end = gmail.indexOf("if (!only && listed.length > 1 && typeof FlowFileAttach", start);
  const code = gmail.slice(start, end);
  const line = gmail.slice(0, start).split('\n').length;
  const fn = new Function('listed', 'catalog', 'ctx', 'let only=null;' + code + '\nreturn only;');
  return { fn, line };
}

const { fn: pickFromCatalog, line: catalogLine } = gmailCatalogPickBlock();
const listedNoId = [
  { filename: 'signed-contract.pdf', mimeType: 'application/pdf', size: 1200 },
  { filename: 'invoice.pdf', mimeType: 'application/pdf', size: 900 }
];
const catalogAttN = [
  { id: 'att-0', name: 'signed-contract.pdf', label: 'signed-contract.pdf', on: true },
  { id: 'att-1', name: 'invoice.pdf', on: false }
];
const picked = pickFromCatalog(listedNoId, catalogAttN, { attachmentPickMode: 'choice' });
check('Gmail catalog att-N picks signed-contract (content-gmail.js:' + catalogLine + ')',
  picked && picked.filename === 'signed-contract.pdf', picked);
const pickSecond = pickFromCatalog(listedNoId, [
  { id: 'att-0', name: 'signed-contract.pdf', on: false },
  { id: 'att-1', name: 'invoice.pdf', on: true }
], { attachmentPickMode: 'choice' });
check('Gmail catalog picks second file by att-N row', pickSecond && pickSecond.filename === 'invoice.pdf', pickSecond);

console.log('\n--- Gmail and Outlook pages call pickSaveAttachment ---\n');
const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
const outlook = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
check('Gmail uses pickSaveAttachment at scan', /FlowFileAttach\.pickSaveAttachment/.test(gmail));
check('Gmail shows save file name on card', /flow-chip-save-file/.test(gmail));
check('Gmail save attach chooser on ambiguous', /buildSaveAttachChooser/.test(gmail));
check('core enriches file-it catalog for choice mode', typeof FA.enrichFileItChoiceCatalog === 'function'
  && FA.enrichFileItChoiceCatalog({ id: 'file-it', steps: [{ kind: 'driveFile', params: {} }] }, tieFiles, 'choice').steps[0].params.catalog.length === 2);
check('Outlook buildCtx uses pickSaveAttachment', /FlowFileAttach\.pickSaveAttachment/.test(outlook));
check('Outlook ctx carries attachmentPickMode', /attachmentPickMode:\s*savePick\.mode/.test(outlook));

console.log('\nFAILURES:', failures);
process.exit(failures ? 1 : 0);
