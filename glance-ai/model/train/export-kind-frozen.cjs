'use strict';
// Features of the kind-level frozen set v0 (labeling/kind-frozen/kind-frozen-v0.cjs) for the lab kind head. Same (row, surface) iteration and same `want` mapping as
// scoreboard/capabilities/kind-frozen-run.cjs, so the engine column and the model column score the same cases. Held out: the kind head never trains on these rows.
// usage: node train/export-kind-frozen.cjs <out.jsonl>
const fs = require('fs');
const { prepare } = require('../runtime/pipeline-v2.cjs');
const ROWS = require('../../labeling/kind-frozen/kind-frozen-v0.cjs');
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const fd = fs.openSync(process.argv[2], 'w'); let n = 0;
ROWS.forEach(([kind, lang, text, want, att, ex], i) => {
  for (const surface of ['gmail', 'outlook']) {
    if (/^(slides|sheet)\./.test(kind) && surface === 'outlook' && want !== 'sheet_create') continue;
    if (/^(slides)/.test(kind) && surface === 'outlook') continue;
    if (/^(word|excel)\./.test(kind) && surface === 'gmail') continue;
    if (kind === 'sheet.row' && surface === 'outlook') continue;
    const w = surface === 'outlook' && want === 'doc_create' ? 'word_create' : surface === 'outlook' && want === 'sheet_create' ? 'excel_create' : want;
    const own = OWN[surface];
    const c = Object.assign({ id: `${i}|${surface}`, surface, direction: 'inbound', from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [own], cc: [], subject: 'Subject', body: text, cleanBody: text, attachmentCount: att || 0, lang, ownNames: ['Sali', 'Sali Sapan', 'סאלי'] }, ex || {});
    const P = prepare(c);
    fs.writeSync(fd, JSON.stringify({ id: `${i}|${surface}`, x: P.x, kind, lang, surface, want: w, vb: P.veto.base, vp: P.veto.product, vc: P.veto.cap }) + '\n'); n++;
  }
});
fs.closeSync(fd); console.log('kind-frozen feature rows', n);
