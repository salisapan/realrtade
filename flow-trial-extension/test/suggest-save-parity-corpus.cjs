// Engine decide() against the vendored reference oracle.
// Compared fields: suggest, files (id, name, order), target, reason.
// Copy is not compared. Spec §9 names the file; the oracle chip says "Save file to".
// Run: node test/suggest-save-parity-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const oracle = require('./oracle/suggest-save/suggest-save.js');
const { FlowSuggestSave: Engine } = require('../core/suggest-save.js');

const dir = path.join(__dirname, 'oracle/suggest-save');
const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'corpus-22.json'), 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(dir, 'cases-extra.json'), 'utf8'));

function filesOf(out) {
  return (out && out.files ? out.files : []).map((f) => ({ id: f.id, name: f.name }));
}
function targetOf(out) {
  return !out || out.target == null ? null : out.target;
}

let diffs = 0;
function compare(label, input) {
  const a = oracle.decide(input);
  const b = Engine.decide(input);
  const bad = [];
  if (!a || !b) bad.push('missing');
  else {
    if (a.suggest !== b.suggest) bad.push('suggest ' + a.suggest + ' vs ' + b.suggest);
    if (a.reason !== b.reason) bad.push('reason ' + a.reason + ' vs ' + b.reason);
    if (targetOf(a) !== targetOf(b)) bad.push('target ' + targetOf(a) + ' vs ' + targetOf(b));
    if (JSON.stringify(filesOf(a)) !== JSON.stringify(filesOf(b))) bad.push('files');
  }
  if (bad.length) {
    diffs++;
    console.log('DIFF', label, bad.join('; '));
  }
  return bad.length === 0;
}

let corpusOk = 0;
corpus.forEach((c) => {
  const label = 'row ' + c.row + (c.variant ? '/' + c.variant : '');
  if (compare(label, c.input)) corpusOk++;
});
let extraOk = 0;
extra.forEach((c) => {
  if (compare('extra ' + c.desc, c.input)) extraOk++;
});

const graphList = [{
  '@odata.type': '#microsoft.graph.fileAttachment',
  id: 'g1', name: 'Q3-report.pdf', contentType: 'application/pdf', size: 245760, isInline: false, contentId: null
}, {
  '@odata.type': '#microsoft.graph.itemAttachment',
  id: 'g2', name: 'forwarded.eml', contentType: 'message/rfc822', size: 1200, isInline: false
}];
const payload = {
  parts: [{
    filename: 'invoice.pdf', mimeType: 'application/pdf', partId: '1',
    body: { attachmentId: 'att-1', size: 4096 },
    headers: [{ name: 'Content-Disposition', value: 'attachment; filename="invoice.pdf"' }]
  }]
};
const html = '<img src="cid:logo@x"> <img src="cid:scan@x">';
const adapterSame = JSON.stringify(oracle.fromGraph(graphList)) === JSON.stringify(Engine.fromGraph(graphList))
  && JSON.stringify(oracle.fromGmailPayload(payload)) === JSON.stringify(Engine.fromGmailPayload(payload))
  && JSON.stringify(oracle.bodyCidsOf(html)) === JSON.stringify(Engine.bodyCidsOf(html));
if (!adapterSame) {
  diffs++;
  console.log('DIFF adapters fromGraph/fromGmailPayload/bodyCidsOf');
} else console.log('PASS adapters');

const total = corpus.length + extra.length;
console.log('parity corpus ' + corpusOk + '/' + corpus.length + '  extra ' + extraOk + '/' + extra.length);
console.log('parity ' + (corpusOk + extraOk) + '/' + total + ' identical');
process.exit(diffs ? 1 : 0);
