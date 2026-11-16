'use strict';
// Capability probe (2026-11-14): one row per KIND of close the product can execute (probe-set.cjs), through the product's real recognition UNION: the shared judge
// with every Labs switch it takes turned on, then each kind-specific reader the judge does not call (workspace file, sheet row, Meet/Teams link, OneDrive new
// file, recurring reminder). Reports per kind: right family / wrong family / silent / offered where silence is right. Lab only; nothing is written anywhere.
// usage: node scoreboard/capabilities/run.cjs [--list] [--md out.md]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { recognize, NOW, OWN } = require('./union.cjs');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const ROWS = require('./probe-set.cjs');
const SAME = { video_link: ['calendar'], file_find: ['draft', 'file_save'], slides_create: ['doc_create'], form_create: ['doc_create'], excel_create: ['word_create', 'sheet_create'], word_create: ['doc_create'], sheet_row: ['task'], doc_append: ['task'], pay: ['task'] };
const accept = (want, got) => got === want || (SAME[want] || []).indexOf(got) >= 0;
const out = {}, detail = [];
for (const [kind, lang, text, want, att] of ROWS) {
  for (const surface of ['gmail', 'outlook']) {
    // Google files and rows live on the Google surface, Word/Excel on the Microsoft one; the other pairing is not a product path, so it is not scored.
    if (/^(slides|form|sheet\.row|doc\.append)/.test(kind) && surface === 'outlook') continue;
    if (/^(word|excel)\./.test(kind) && surface === 'gmail') continue;
    const wantHere = surface === 'outlook' && want === 'doc_create' ? 'word_create' : surface === 'outlook' && want === 'sheet_create' ? 'excel_create' : want;
    const over = { surface, hasThreadAttachment: (att || 0) === 1, attachmentCount: att || 0 };
    if (kind === 'notice.system') over.sender = { name: 'Vercel', email: 'billing@vercel.com' };
    if (want === 'chain') continue; // the worker's search chain owns it; the judge alone is silent by design
    const rec = recognize(over, text), got = rec.family, via = rec.via;
    const k = out[kind] = out[kind] || { n: 0, right: 0, wrongFamily: 0, silent: 0, falseOffer: 0, want, judge: 0, reader: 0 };
    k.n++;
    if (want === 'none') { if (got !== 'none') k.falseOffer++; else k.right++; }
    else if (got === 'none') k.silent++;
    else if (accept(wantHere, got)) { k.right++; k[via]++; }
    else k.wrongFamily++;
    detail.push([kind, lang, surface, wantHere, got, via, rec.reason]);
  }
}
const lines = ['| kind | rows x surfaces | right | wrong family | silent (a miss) | offered where silence is right | right via judge / reader |', '|---|---|---|---|---|---|---|'];
for (const [k, v] of Object.entries(out)) lines.push(`| ${k} | ${v.n} | ${v.right} | ${v.wrongFamily} | ${v.silent} | ${v.falseOffer} | ${v.judge} / ${v.reader} |`);
const tot = Object.values(out).reduce((a, v) => { a.n += v.n; a.right += v.right; a.wf += v.wrongFamily; a.sil += v.silent; a.fo += v.falseOffer; return a; }, { n: 0, right: 0, wf: 0, sil: 0, fo: 0 });
lines.push(`| **all** | ${tot.n} | ${tot.right} | ${tot.wf} | ${tot.sil} | ${tot.fo} | |`);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ out, detail, tot })); process.exit(0); }
console.log(lines.join('\n'));
if (process.argv.includes('--list')) console.log('\n' + detail.filter((d) => (d[3] === 'none' ? d[4] !== 'none' : !accept(d[3], d[4]))).map((d) => d.join(' | ')).join('\n'));
if (arg('md')) fs.writeFileSync(arg('md'), lines.join('\n') + '\n');
