'use strict';
// The kind-level frozen set v0 (glance-ai/labeling/kind-frozen/kind-frozen-v0.cjs) through the product's recognition union. Held out: never train on it and never tune
// an engine rule against a row of it. Reports per kind, the wrong-Do-It count on the contrast rows, and a 95% Wilson interval on the whole. Lab only.
// usage: node scoreboard/capabilities/kind-frozen-run.cjs [--list] [--json]
const { recognize } = require('./union.cjs');
const ROWS = require('../../labeling/kind-frozen/kind-frozen-v0.cjs');
const SAME = { video_link: ['calendar'], slides_create: ['doc_create'], excel_create: ['word_create', 'sheet_create'], word_create: ['doc_create'], sheet_row: ['task'], pay: ['task'] };
const ok = (w, g) => (w === 'none' ? g === 'none' : g !== 'none' && (g === w || (SAME[w] || []).indexOf(g) >= 0));
const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
const out = {}, detail = [];
for (const [kind, lang, text, want, att, ex] of ROWS) {
  for (const surface of ['gmail', 'outlook']) {
    if (/^(slides|sheet)\./.test(kind) && surface === 'outlook' && want !== 'sheet_create') continue;
    if (/^(slides)/.test(kind) && surface === 'outlook') continue;
    if (/^(word|excel)\./.test(kind) && surface === 'gmail') continue;
    if (kind === 'sheet.row' && surface === 'outlook') continue;
    const w = surface === 'outlook' && want === 'doc_create' ? 'word_create' : surface === 'outlook' && want === 'sheet_create' ? 'excel_create' : want;
    const rec = recognize(Object.assign({ surface, hasThreadAttachment: (att || 0) === 1, attachmentCount: att || 0 }, ex || {}), text);
    const right = ok(w, rec.family);
    const k = out[kind] = out[kind] || { n: 0, right: 0, silent: 0, wrong: 0, falseOffer: 0 };
    k.n++; if (right) k.right++; else if (w === 'none') k.falseOffer++; else if (rec.family === 'none') k.silent++; else k.wrong++;
    detail.push([kind, lang, surface, w, rec.family, rec.via, rec.reason, right, text.slice(0, 80).replace(/\n/g, ' ')]);
  }
}
const pos = detail.filter((d) => d[3] !== 'none'), neg = detail.filter((d) => d[3] === 'none');
const tot = { n: detail.length, right: detail.filter((d) => d[7]).length, posN: pos.length, posRight: pos.filter((d) => d[7]).length, negN: neg.length, falseOffers: neg.filter((d) => !d[7]).length };
if (process.argv.includes('--json')) { console.log(JSON.stringify({ out, detail, tot })); process.exit(0); }
console.log('| kind | rows | right | silent | wrong family | offered where silence is right |\n|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(out)) console.log(`| ${k} | ${v.n} | ${v.right} | ${v.silent} | ${v.wrong} | ${v.falseOffer} |`);
const wr = wilson(tot.posRight, tot.posN), wn = wilson(tot.negN - tot.falseOffers, tot.negN);
console.log(`\nrecall on rows with a close: ${tot.posRight}/${tot.posN} (95% ${(wr[0] * 100).toFixed(0)} to ${(wr[1] * 100).toFixed(0)}%)`);
console.log(`silence on contrast rows: ${tot.negN - tot.falseOffers}/${tot.negN} (95% ${(wn[0] * 100).toFixed(0)} to ${(wn[1] * 100).toFixed(0)}%); wrong Do It: ${tot.falseOffers}`);
if (process.argv.includes('--list')) console.log('\n' + detail.filter((d) => !d[7]).map((d) => d.slice(0, 7).join(' | ') + ' || ' + d[8]).join('\n'));
